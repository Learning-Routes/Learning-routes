module AiOrchestrator
  class Orchestrate
    # Raised when a request cannot even be recorded — an unregistered task_type or
    # model, i.e. the app is misconfigured. Distinct from "the model answered badly",
    # which is an expected runtime condition callers are right to absorb.
    #
    # This distinction exists because collapsing the two is what hid a total product
    # failure for months: `curriculum_design` was missing from
    # AiModelConfig::TASK_TYPES, AiInteraction.create! raised RecordInvalid, and
    # CurriculumBrain's catch-all rescue turned it into a quiet template fallback.
    # Every route in production was generic and nothing surfaced.
    class ConfigurationError < StandardError; end

    # Main entry point for AI requests.
    # Can be called synchronously or asynchronously (via background job).
    #
    # Usage:
    #   # Async (recommended) - returns the AiInteraction record immediately
    #   interaction = AiOrchestrator::Orchestrate.call(
    #     task_type: :route_generation,
    #     variables: { topic: "Ruby on Rails", goal: "Build web apps" },
    #     user: current_user,
    #     async: true
    #   )
    #
    #   # Sync - waits for completion, returns the AiInteraction record
    #   interaction = AiOrchestrator::Orchestrate.call(
    #     task_type: :quick_grading,
    #     variables: { question: "...", student_answer: "..." },
    #     user: current_user,
    #     async: false
    #   )

    def self.call(task_type:, variables: {}, user: nil, async: true, params: {})
      new(task_type: task_type, variables: variables, user: user, params: params).call(async: async)
    end

    # Agent-based execution: uses ContentAgent with tools for rich content generation.
    # Returns the AiInteraction record.
    def self.run_agent(task_type:, variables: {}, user: nil, params: {})
      new(task_type: task_type, variables: variables, user: user, params: params).run_agent
    end

    def initialize(task_type:, variables: {}, user: nil, params: {})
      @task_type = task_type.to_s
      @variables = variables
      @user = user
      @params = params
    end

    def call(async: true)
      # Build prompt
      builder = PromptBuilder.new(task_type: @task_type, variables: @variables, user: @user)
      prompts = builder.build

      # Resolve model
      model = ModelRouter.model_for(@task_type)

      # Create interaction record.
      #
      # A validation failure here is never the model's fault — task_type is not in
      # AiModelConfig::TASK_TYPES, or model is not in AiInteraction::SUPPORTED_MODELS.
      # Translate it into ConfigurationError so callers can tell it apart from a bad
      # response instead of absorbing both into the same fallback.
      interaction = begin
        AiInteraction.create!(
          user: @user,
          model: model,
          task_type: @task_type,
          prompt: prompts[:user],
          status: :pending,
          metadata: { variables: @variables, system_prompt_length: prompts[:system].length }
        )
      rescue ActiveRecord::RecordInvalid => e
        raise ConfigurationError,
              "Cannot record an AI interaction for task_type=#{@task_type.inspect} " \
              "model=#{model.inspect}: #{e.record.errors.full_messages.join('; ')}. " \
              "Register the task type in AiOrchestrator::AiModelConfig::TASK_TYPES and " \
              "the model in AiOrchestrator::AiInteraction::SUPPORTED_MODELS."
      end

      if async
        AiRequestJob.perform_later(
          interaction_id: interaction.id,
          task_type: @task_type,
          prompt: prompts[:user],
          system_prompt: prompts[:system],
          user_id: @user&.id,
          params: prompts[:model_params].merge(@params)
        )
      else
        execute_sync(interaction, prompts)
      end

      interaction
    end

    def run_agent
      builder = PromptBuilder.new(task_type: @task_type, variables: @variables, user: @user)
      prompts = builder.build

      interaction = AiInteraction.create!(
        user: @user,
        model: "gpt-5.2",
        task_type: @task_type,
        prompt: prompts[:user],
        status: :processing,
        metadata: {
          variables: @variables,
          system_prompt_length: prompts[:system].length,
          agent_mode: true
        }
      )

      # Set thread-local context for tools that need user/locale
      Thread.current[:lesson_agent_user] = @user
      Thread.current[:lesson_agent_locale] = @variables[:locale] || "en"

      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      agent = ContentAgent.new
      response = agent.ask(prompts[:user])
      input_tokens, output_tokens = agent.usage_totals

      elapsed_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round

      interaction.mark_completed!(
        response_text: response.content,
        input_tokens: input_tokens,
        output_tokens: output_tokens,
        latency_ms: elapsed_ms
      )

      Rails.logger.info(
        "[AiOrchestrator] Agent completed in #{elapsed_ms}ms " \
        "| tokens: #{input_tokens}+#{output_tokens} " \
        "| cost: #{interaction.cost_cents}c"
      )

      interaction
    rescue => e
      interaction&.mark_failed!(error: e)
      Rails.logger.error("[AiOrchestrator] Agent failed: #{e.message}")
      interaction
    ensure
      Thread.current[:lesson_agent_user] = nil
      Thread.current[:lesson_agent_locale] = nil
    end

    private

    def execute_sync(interaction, prompts)
      interaction.update!(status: :processing)

      # Check cache
      cached = CacheService.fetch(task_type: @task_type, prompt: prompts[:user], model: interaction.model)
      if cached
        interaction.update!(
          status: :completed,
          response: cached[:content],
          cached: true,
          latency_ms: 0,
          cost_cents: 0,
          cost_microcents: 0
        )
        return
      end

      router = ModelRouter.new(task_type: @task_type, user: @user)
      result = router.execute do |model, model_params|
        merged = model_params.merge(prompts[:model_params]).merge(@params.symbolize_keys)
        client = AiClient.new(model: model, task_type: @task_type, user: @user)
        client.chat(prompt: prompts[:user], system_prompt: prompts[:system], params: merged)
      end

      interaction.mark_completed!(
        response_text: result[:content],
        input_tokens: result[:input_tokens],
        output_tokens: result[:output_tokens],
        latency_ms: result[:latency_ms]
      )

      CacheService.store(
        task_type: @task_type,
        prompt: prompts[:user],
        model: interaction.model,
        response: result[:content]
      )
    rescue => e
      interaction.mark_failed!(error: e)
    end
  end
end
