module Assessments
  class AssessmentResult < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :assessment
    # The answers given during THIS attempt. Scoring reads these, not every answer
    # the user has ever given to the assessment's questions.
    has_many :user_answers, class_name: "Assessments::UserAnswer",
             foreign_key: :assessment_result_id, dependent: :destroy

    validates :score, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 },
              allow_nil: true

    scope :passed, -> { where(passed: true) }
    scope :failed, -> { where(passed: false) }
    scope :for_user, ->(user) { where(user: user) }
    scope :recent, -> { order(created_at: :desc) }

    before_save :determine_pass_status

    # ── Which attempt are we talking about? ─────────────────────────────────
    #
    # Three callers used three different answers to this question and the
    # disagreement was the bug (WP-32 §2, §4):
    #
    #   assessments#take     find_by(user:, assessment:, score: nil)  — unordered
    #   answers#create       .where(score: nil).order(:created_at).last
    #   steps#show           find_by(user:, assessment:)  — no score filter at all
    #
    # The last one is why a student who failed once could never retake: it
    # returned an arbitrary row, the step page showed the score ring whenever
    # that row had a score, and the only Start button lived in the other branch.
    # The first two are why a split attempt scored 0%: answers landed on one row
    # and submit scored the other.

    # The attempt still open, or nil. At most one can exist — see the partial
    # unique index in 20260907000001_one_open_assessment_attempt.
    def self.open_attempt_for(user:, assessment:)
      where(user: user, assessment: assessment, score: nil).order(:created_at).last
    end

    # The open attempt, opening one if there is none.
    #
    # `create_or_find_by!` rather than `find_by || create!`: the read-then-write
    # version let two concurrent starts both miss and both insert. The fast path
    # keeps the common case a single SELECT.
    def self.open_attempt_for!(user:, assessment:)
      open_attempt_for(user: user, assessment: assessment) ||
        create_or_find_by!(user: user, assessment: assessment, score: nil)
    end

    # The last attempt that was actually scored. An open attempt has no score and
    # can neither pass a student nor fail one.
    def self.latest_scored_for(user:, assessment:)
      where(user: user, assessment: assessment).where.not(score: nil).order(:created_at).last
    end

    # What to SHOW a student about this assessment: the attempt they are in the
    # middle of, or failing that the last thing that happened to them.
    def self.current_for(user:, assessment:)
      open_attempt_for(user: user, assessment: assessment) ||
        latest_scored_for(user: user, assessment: assessment)
    end

    private

    def determine_pass_status
      return unless score && assessment
      self.passed = score >= assessment.passing_score
    end
  end
end
