# frozen_string_literal: true

module LearningRoutesEngine
  # A student's attempt at one interactive lesson block.
  #
  # Three outcomes, deliberately distinct (WP10_DESIGN.md §3 amendment):
  #
  #   passed?    correct == true                   — they got it right
  #   released?  released_at present                — they failed RELEASE_AFTER times and the
  #                                                   block stopped gating. NOT a pass.
  #   engaged?   correct.nil? && completed_at set   — an ungradable block they interacted with
  #
  # `satisfied?` is the only thing progression asks about, and it is the union of the
  # three. Nothing downstream of grading (FSRS, gap analysis) may treat `released?` as
  # correct — see #fsrs_rating.
  class BlockAttempt < ApplicationRecord
    self.table_name = "learning_routes_engine_block_attempts"

    # After this many failed submissions of the same block, it stops gating. The student
    # is far more likely to be right than a freshly-rewritten AI prompt is.
    RELEASE_AFTER = 3

    belongs_to :user, class_name: "Core::User"
    belongs_to :route_step, class_name: "LearningRoutesEngine::RouteStep"

    validates :section_index, presence: true,
              numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validates :block_type, presence: true
    validates :section_index, uniqueness: { scope: %i[user_id route_step_id] }

    scope :satisfied, -> { where.not(completed_at: nil) }
    scope :released, -> { where.not(released_at: nil) }

    def passed?  = correct == true
    def failed?  = correct == false
    def released? = released_at.present?
    def engaged? = correct.nil? && completed_at.present?

    # The only question progression asks. A released block satisfies progression without
    # claiming the student was right.
    def satisfied? = completed_at.present?

    def gradable? = !correct.nil? || failed?

    # What this attempt contributes to FSRS, or nil if it must not contribute at all.
    #
    # A RELEASED block returns nil. That is the point of keeping released_at separate:
    # the student failed it three times, so calling it GOOD would tell the scheduler they
    # know the material, and calling it AGAIN would punish them for our bad answer key.
    # The honest answer is that we learned nothing, so it feeds nothing.
    def fsrs_rating
      return nil if released?
      return flashcard_rating if block_type == "flashcards"
      return nil if correct.nil?     # other engagement-only blocks carry no mastery signal

      if correct
        attempts.to_i <= 1 ? SpacedRepetition::GOOD : SpacedRepetition::HARD
      else
        SpacedRepetition::AGAIN
      end
    end

    # Flashcards are the one self-reported signal FSRS actually wants. They are not
    # correct/incorrect — `correct` stays NULL — but they do carry a rating.
    FLASHCARD_RATINGS = {
      "hard"   => SpacedRepetition::HARD,
      "normal" => SpacedRepetition::GOOD,
      "good"   => SpacedRepetition::GOOD,
      "easy"   => SpacedRepetition::EASY
    }.freeze

    # WORST card, not the average (WP10_DESIGN.md §4, approved): FSRS schedules the STEP.
    # One card still hard means the step must come back sooner; averaging buries it
    # behind four easy ones, and erring toward earlier review is the safe direction.
    def flashcard_rating
      ratings = payload.is_a?(Hash) ? payload["ratings"] : nil
      values = ratings.is_a?(Hash) ? ratings.values : Array(ratings)
      mapped = values.filter_map { |v| FLASHCARD_RATINGS[v.to_s.downcase] }
      return nil if mapped.empty?

      mapped.min
    end
  end
end
