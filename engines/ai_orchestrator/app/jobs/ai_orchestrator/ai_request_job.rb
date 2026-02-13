module AiOrchestrator
  class AiRequestJob < ApplicationJob
    queue_as :ai_requests

    # Exponential backoff: 3s, 18s, 108s, ~10min, ~1hr
    retry_on AiClient::RequestError, wait: :polynomially_longer, attempts: 5
    retry_on AiClient::TimeoutError, wait: 30.seconds, attempts: 3
    discard_on ArgumentError

    # Timeout entire job after 5 minutes
    EXECUTION_TIMEOUT = 5.minutes.to_i

    def perform(interaction_id:, task_type:, prompt:, system_prompt: nil, user_id: nil, params: {}, broadcast: true)
      interaction = AiInteraction.find(interaction_id)
      interaction.update!(status: :processing)

      user = user_id ? Core::User.find_by(id: user_id) : nil

      # Check cache first
      cached = CacheService.fetch(task_type: task_type, prompt: prompt, model: interaction.model)
      if cached
        interaction.update!(
          status: :completed,
          response: cached[:content],
          cached: true,
          latency_ms: 0,
          cost_cents: 0
        )
        broadcast_completion(interaction) if broadcast
        return
      end

      router = ModelRouter.new(task_type: task_type, user: user)

      result = Timeout.timeout(EXECUTION_TIMEOUT) do
        router.execute do |model, model_params|
          merged_params = model_params.merge(params.symbolize_keys)
          client = AiClient.new(model: model, task_type: task_type, user: user)
          client.chat(prompt: prompt, system_prompt: system_prompt, params: merged_params)
        end
      end

      interaction.mark_completed!(
        response_text: result[:content],
        input_tokens: result[:input_tokens],
        output_tokens: result[:output_tokens],
        latency_ms: result[:latency_ms]
      )

      # Store in cache
      CacheService.store(
        task_type: task_type,
        prompt: prompt,
        model: interaction.model,
        response: result[:content]
      )

      broadcast_completion(interaction) if broadcast

    rescue Timeout::Error
      interaction.mark_timeout!
      broadcast_error(interaction, "Request timed out") if broadcast
    rescue ModelRouter::RateLimitExceeded => e
      interaction.mark_failed!(error: e)
      broadcast_error(interaction, e.message) if broadcast
    rescue ModelRouter::AllModelsUnavailable => e
      interaction.mark_failed!(error: e)
      broadcast_error(interaction, e.message) if broadcast
    rescue => e
      interaction.mark_failed!(error: e)
      broadcast_error(interaction, "An unexpected error occurred") if broadcast
      raise if attempts_remaining?
    end

    private

    def broadcast_completion(interaction)
      return unless defined?(Turbo::StreamsChannel)

      Turbo::StreamsChannel.broadcast_replace_to(
        "ai_interaction_#{interaction.id}",
        target: "ai_interaction_#{interaction.id}",
        partial: "ai_orchestrator/interactions/result",
        locals: { interaction: interaction }
      )
    rescue => e
      Rails.logger.warn("[AiRequestJob] Broadcast failed: #{e.message}")
    end

    def broadcast_error(interaction, message)
      return unless defined?(Turbo::StreamsChannel)

      Turbo::StreamsChannel.broadcast_replace_to(
        "ai_interaction_#{interaction.id}",
        target: "ai_interaction_#{interaction.id}",
        partial: "ai_orchestrator/interactions/error",
        locals: { interaction: interaction, error_message: message }
      )
    rescue => e
      Rails.logger.warn("[AiRequestJob] Broadcast failed: #{e.message}")
    end

    def attempts_remaining?
      executions < (self.class.retry_on_options&.first&.dig(:attempts) || 5)
    end

    def retry_on_options
      self.class.instance_variable_get(:@retry_on_options)
    end
  end
end
