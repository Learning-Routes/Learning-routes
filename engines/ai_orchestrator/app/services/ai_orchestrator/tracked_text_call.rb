# frozen_string_literal: true

module AiOrchestrator
  class TrackedTextCall
    def self.call(prompt:, task_type:, user: Thread.current[:lesson_agent_user])
      client = AiClient.new(model: "gpt-4.1-mini", task_type: task_type, user: user)
      result = client.chat(prompt: prompt)
      persist_success(user, task_type, result)
      result[:content].to_s
    rescue AiClient::RequestError => e
      persist_failure(user, task_type)
      raise e
    end

    def self.persist_success(user, task_type, result)
      interaction = AiInteraction.create!(
        user: user, model: "gpt-4.1-mini", task_type: task_type,
        prompt: "content_tool", status: :processing
      )
      interaction.mark_completed!(
        response_text: "tool_completed", input_tokens: result[:input_tokens].to_i,
        output_tokens: result[:output_tokens].to_i, latency_ms: result[:latency_ms].to_i
      )
    rescue ActiveRecord::ActiveRecordError => e
      Rails.logger.warn("[TrackedTextCall] Metering failed (#{e.class.name})")
    end
    private_class_method :persist_success

    def self.persist_failure(user, task_type)
      AiInteraction.create!(
        user: user, model: "gpt-4.1-mini", task_type: task_type,
        prompt: "content_tool", status: :failed, pricing_status: "unpriced"
      )
    rescue ActiveRecord::ActiveRecordError
      nil
    end
    private_class_method :persist_failure
  end
end
