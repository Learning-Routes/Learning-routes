module AiOrchestrator
  class AiInteraction < ApplicationRecord
    # The DB column "cache_key" conflicts with ActiveRecord's reserved
    # method. Allow it — instance-level access shadows class method safely.
    def self.dangerous_attribute_method?(method_name)
      return false if method_name == "cache_key"
      super
    end

    belongs_to :user, class_name: "Core::User", optional: true

    enum :status, { pending: 0, processing: 1, completed: 2, failed: 3, timeout: 4 }

    validates :model, presence: true
    validates :prompt, presence: true

    scope :by_model, ->(model) { where(model: model) }
    scope :by_task, ->(task) { where(task_type: task) }
    scope :successful, -> { where(status: :completed) }
    scope :failed_requests, -> { where(status: [:failed, :timeout]) }
    scope :cached_hits, -> { where(cached: true) }
    scope :recent, -> { order(created_at: :desc) }
    scope :today, -> { where("created_at >= ?", Time.current.beginning_of_day) }
    scope :this_week, -> { where("created_at >= ?", Time.current.beginning_of_week) }
    scope :this_month, -> { where("created_at >= ?", Time.current.beginning_of_month) }

    SUPPORTED_MODELS = %w[
      gpt-5.2
      claude-opus-4-5
      claude-haiku-4-5
      claude-sonnet-4-5
      gpt-5.1-codex-mini
      elevenlabs
      nanobanana-pro
      nanobanana-flash
    ].freeze

    validates :model, inclusion: { in: SUPPORTED_MODELS }
    validates :task_type, inclusion: { in: AiModelConfig::TASK_TYPES }, allow_nil: true

    def cost_dollars
      cost_cents / 100.0
    end

    def latency_seconds
      (latency_ms || 0) / 1000.0
    end

    def total_tokens
      (input_tokens || 0) + (output_tokens || 0)
    end

    def mark_completed!(response_text:, input_tokens: 0, output_tokens: 0, latency_ms: 0)
      update!(
        status: :completed,
        response: response_text,
        input_tokens: input_tokens,
        output_tokens: output_tokens,
        tokens_used: input_tokens + output_tokens,
        latency_ms: latency_ms,
        cost_cents: CostTracker.estimate_cost(
          model: model,
          input_tokens: input_tokens,
          output_tokens: output_tokens
        )
      )
    end

    def mark_failed!(error:)
      update!(
        status: :failed,
        error_message: error.to_s.truncate(1000)
      )
    end

    def mark_timeout!
      update!(
        status: :timeout,
        error_message: "Request timed out"
      )
    end
  end
end
