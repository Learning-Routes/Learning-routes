module Assessments
  class Assessment < ApplicationRecord
    belongs_to :route_step, class_name: "LearningRoutesEngine::RouteStep"

    has_many :questions, dependent: :destroy
    has_many :assessment_results, dependent: :destroy

    enum :assessment_type, { diagnostic: 0, level_up: 1, final: 2, reinforcement: 3, step_quiz: 4 }

    validates :assessment_type, presence: true
    validates :passing_score, numericality: { greater_than: 0, less_than_or_equal_to: 100 }

    scope :by_type, ->(type) { where(assessment_type: type) }
    scope :step_quizzes, -> { where(assessment_type: :step_quiz) }
    scope :for_step, ->(step) { where(route_step: step) }

    def passed_by?(user)
      assessment_results.exists?(user: user, passed: true)
    end
  end
end
