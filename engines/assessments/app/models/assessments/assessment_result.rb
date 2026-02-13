module Assessments
  class AssessmentResult < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :assessment

    validates :score, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 },
              allow_nil: true

    scope :passed, -> { where(passed: true) }
    scope :failed, -> { where(passed: false) }
    scope :for_user, ->(user) { where(user: user) }
    scope :recent, -> { order(created_at: :desc) }

    before_save :determine_pass_status

    private

    def determine_pass_status
      return unless score && assessment
      self.passed = score >= assessment.passing_score
    end
  end
end
