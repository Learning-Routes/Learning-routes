module Assessments
  class UserAnswer < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :question
    # Optional: legacy rows written before answers were scoped to an attempt keep
    # a NULL here. They belong to no attempt, are never counted by
    # `results#submit`, and never block a new answer.
    belongs_to :assessment_result, optional: true

    validates :answer, presence: true, length: { maximum: 10_000 }
    # One answer per (ATTEMPT, question), backed by a unique DB index so the
    # guard holds under concurrent submissions and not just at the app layer.
    #
    # It used to be scoped to `user_id`, which made an answer final for the life
    # of the account and retakes impossible. The anti-cheat property is unchanged
    # in strength — a student still cannot re-grade an answer inside a run — it is
    # only scoped to the run it was always meant to describe.
    validates :question_id, uniqueness: { scope: :assessment_result_id }

    scope :correct_answers, -> { where(correct: true) }
    scope :incorrect_answers, -> { where(correct: false) }
    scope :for_user, ->(user) { where(user: user) }
  end
end
