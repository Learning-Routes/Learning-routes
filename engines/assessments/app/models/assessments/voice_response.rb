module Assessments
  class VoiceResponse < ApplicationRecord
    self.table_name = "assessments_voice_responses"

    belongs_to :route_step, class_name: "LearningRoutesEngine::RouteStep"
    belongs_to :user, class_name: "Core::User"
    belongs_to :assessment_result, class_name: "Assessments::AssessmentResult", optional: true

    STATUSES = %w[pending transcribing evaluating completed failed].freeze

    scope :by_user, ->(user_id) { where(user_id: user_id) }
    scope :by_step, ->(step_id) { where(route_step_id: step_id) }
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

    def pass?(threshold = 60)
      completed? && score.to_i >= threshold
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
