module ContentEngine
  class AiContent < ApplicationRecord
    belongs_to :route_step, class_name: "LearningRoutesEngine::RouteStep"

    enum :content_type, { text: 0, code: 1, explanation: 2, exercise: 3 }, prefix: true

    # Audio generation states
    AUDIO_STATUSES = %w[pending generating ready failed skipped].freeze

    validates :content_type, presence: true
    validates :body, presence: true
    validates :audio_status, inclusion: { in: AUDIO_STATUSES }, allow_nil: true

    scope :by_type, ->(type) { where(content_type: type) }
    scope :cached_content, -> { where(cached: true) }
    scope :by_model, ->(model) { where(ai_model: model) }
    scope :with_audio_ready, -> { where(audio_status: "ready") }
    scope :audio_pending, -> { where(audio_status: "pending") }

    def total_cost
      generation_cost || 0
    end

    def audio_ready?
      audio_status == "ready" && audio_url.present?
    end

    def audio_generating?
      audio_status == "generating"
    end

    def audio_failed?
      audio_status == "failed"
    end

    def needs_audio?
      audio_status == "pending" && audio_url.blank?
    end

    def mark_audio_generating!
      update!(audio_status: "generating")
    end

    def mark_audio_ready!(url:, duration: nil, voice: nil, transcript: nil)
      update!(
        audio_status: "ready",
        audio_url: url,
        audio_duration: duration,
        voice_id: voice,
        audio_transcript: transcript
      )
    end

    def mark_audio_failed!
      update!(audio_status: "failed")
    end
  end
end
