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
    scope :billable, -> { where(status: :completed, cached: [false, nil], pricing_status: "priced") }
    scope :unpriced, -> { where(pricing_status: "unpriced") }

    SUPPORTED_MODELS = %w[
      gpt-5.2
      claude-opus-4-5
      claude-haiku-4-5
      claude-sonnet-4-5
      gpt-4.1-mini
      elevenlabs
      eleven_multilingual_v2
      eleven_flash_v2_5
      scribe_v2
      gpt-image-1
      tavily
    ].freeze

    validates :model, inclusion: { in: SUPPORTED_MODELS }
    validates :task_type, inclusion: { in: AiModelConfig::TASK_TYPES }, allow_nil: true
    validates :pricing_status, inclusion: { in: %w[priced unpriced] }

    attr_readonly :provider_units, :provider_rate_microcents, :pricing_version

    def cost_dollars
      BigDecimal(cost_microcents.to_s) / CostTracker::MICROCENTS_PER_DOLLAR
    end

    def latency_seconds
      (latency_ms || 0) / 1000.0
    end

    def total_tokens
      (input_tokens || 0) + (output_tokens || 0)
    end

    def mark_completed!(response_text:, input_tokens: 0, output_tokens: 0, latency_ms: 0,
                        image_input_tokens: 0, characters: nil, audio_seconds: nil)
      provider_priced = CostTracker::PRICING.dig(model, :provider_reported_credits)
      microcents = if cached? || provider_priced
        0
      else
        CostTracker.estimate_microcents(
          model: model, input_tokens: input_tokens, output_tokens: output_tokens,
          image_input_tokens: image_input_tokens, characters: characters,
          audio_seconds: audio_seconds
        )
      end

      update!(
        status: :completed,
        response: response_text,
        input_tokens: input_tokens,
        output_tokens: output_tokens,
        tokens_used: input_tokens + output_tokens,
        latency_ms: latency_ms,
        pricing_status: provider_priced ? "unpriced" : "priced",
        cost_microcents: microcents,
        cost_cents: CostTracker.microcents_to_cents(microcents)
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
