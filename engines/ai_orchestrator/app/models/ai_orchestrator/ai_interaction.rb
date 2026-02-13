module AiOrchestrator
  class AiInteraction < ApplicationRecord
    belongs_to :user, class_name: "Core::User", optional: true

    enum :status, { pending: 0, processing: 1, completed: 2, failed: 3, timeout: 4 }

    validates :model, presence: true
    validates :prompt, presence: true

    scope :by_model, ->(model) { where(model: model) }
    scope :successful, -> { where(status: :completed) }
    scope :failed_requests, -> { where(status: [:failed, :timeout]) }
    scope :recent, -> { order(created_at: :desc) }
    scope :today, -> { where("created_at >= ?", Time.current.beginning_of_day) }

    SUPPORTED_MODELS = %w[
      gpt-5.2
      claude-opus-4-6
      claude-haiku-4-5
      claude-sonnet-4-5
      gpt-5.1-codex-mini
      elevenlabs
      nanobanana-pro
      nanobanana-flash
    ].freeze

    validates :model, inclusion: { in: SUPPORTED_MODELS }

    def cost_dollars
      cost_cents / 100.0
    end

    def latency_seconds
      (latency_ms || 0) / 1000.0
    end
  end
end
