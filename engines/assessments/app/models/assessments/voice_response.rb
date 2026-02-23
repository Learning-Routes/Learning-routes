module Assessments
  class VoiceResponse < ApplicationRecord
    belongs_to :route_step, class_name: "LearningRoutesEngine::RouteStep"
    belongs_to :user, class_name: "Core::User"
    belongs_to :assessment_result, class_name: "Assessments::AssessmentResult", optional: true

    STATUSES = %w[pending transcribing evaluating completed failed].freeze

    validates :status, inclusion: { in: STATUSES }

    scope :by_user, ->(user) { where(user: user) }
    scope :by_step, ->(step) { where(route_step: step) }
    scope :completed, -> { where(status: "completed") }
    scope :latest_first, -> { order(created_at: :desc) }

    def completed?
      status == "completed"
    end

    def evaluating?
      status == "evaluating"
    end

    def failed?
      status == "failed"
    end

    def pass?
      score.present? && score >= 70
    end

    def feedback_text
      ai_evaluation.dig("feedback") || ""
    end

    def strengths
      ai_evaluation.dig("strengths") || []
    end

    def improvements
      ai_evaluation.dig("improvements") || []
    end
  end
end
