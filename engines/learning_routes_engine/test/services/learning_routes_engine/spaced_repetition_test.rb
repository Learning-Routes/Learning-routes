require "ostruct"
require "test_helper"

module LearningRoutesEngine
  class SpacedRepetitionTest < ActiveSupport::TestCase
    setup do
      @sr = SpacedRepetition.new
    end

    # Use OpenStruct mocks - no DB needed for pure algorithm testing
    def new_card
      OpenStruct.new(
        fsrs_stability: 0.0,
        fsrs_difficulty: 0.0,
        fsrs_reps: 0,
        fsrs_lapses: 0,
        fsrs_state: SpacedRepetition::NEW,
        fsrs_last_review_at: nil,
        fsrs_next_review_at: nil,
        fsrs_elapsed_days: 0.0,
        fsrs_scheduled_days: 0.0
      )
    end

    def reviewed_card(stability: 2.4, difficulty: 4.93, reps: 1, state: SpacedRepetition::REVIEW)
      OpenStruct.new(
        fsrs_stability: stability,
        fsrs_difficulty: difficulty,
        fsrs_reps: reps,
        fsrs_lapses: 0,
        fsrs_state: state,
        fsrs_last_review_at: 3.days.ago,
        fsrs_next_review_at: 1.day.ago,
        fsrs_elapsed_days: 3.0,
        fsrs_scheduled_days: 3.0
      )
    end

    test "new card with Good rating transitions to review state" do
      card = new_card
      result = @sr.review(card, SpacedRepetition::GOOD)

      assert_equal SpacedRepetition::REVIEW, result[:fsrs_state]
      assert result[:fsrs_stability] > 0, "Stability should be positive"
      assert result[:fsrs_next_review_at] > Time.current, "Next review should be in the future"
      assert_equal 1, result[:fsrs_reps]
      assert_equal 0, result[:fsrs_lapses]
    end

    test "new card with Again rating goes to relearning" do
      card = new_card
      result = @sr.review(card, SpacedRepetition::AGAIN)

      assert_equal SpacedRepetition::RELEARNING, result[:fsrs_state]
      assert_equal 1, result[:fsrs_lapses]
      assert result[:fsrs_stability] > 0
    end

    test "new card with Easy rating gives higher stability than Good" do
      card = new_card
      good_result = @sr.review(card, SpacedRepetition::GOOD)
      easy_result = @sr.review(card, SpacedRepetition::EASY)

      assert easy_result[:fsrs_stability] > good_result[:fsrs_stability],
             "Easy should give higher stability than Good"
    end

    test "existing card stability increases on Good rating" do
      card = reviewed_card
      result = @sr.review(card, SpacedRepetition::GOOD)

      assert result[:fsrs_stability] > card.fsrs_stability,
             "Stability should increase on successful review"
      assert_equal SpacedRepetition::REVIEW, result[:fsrs_state]
      assert_equal 2, result[:fsrs_reps]
    end

    test "existing card stability decreases on Again rating" do
      card = reviewed_card(stability: 10.0)
      result = @sr.review(card, SpacedRepetition::AGAIN)

      assert result[:fsrs_stability] < card.fsrs_stability,
             "Stability should decrease on lapse"
      assert_equal SpacedRepetition::RELEARNING, result[:fsrs_state]
      assert_equal 1, result[:fsrs_lapses]
    end

    test "difficulty stays within bounds" do
      card = new_card
      result = @sr.review(card, SpacedRepetition::AGAIN)
      assert result[:fsrs_difficulty] >= 1.0
      assert result[:fsrs_difficulty] <= 10.0

      result = @sr.review(card, SpacedRepetition::EASY)
      assert result[:fsrs_difficulty] >= 1.0
      assert result[:fsrs_difficulty] <= 10.0
    end

    test "next review interval is between 1 and 365 days" do
      card = new_card
      result = @sr.review(card, SpacedRepetition::GOOD)
      assert result[:fsrs_scheduled_days] >= 1
      assert result[:fsrs_scheduled_days] <= 365
    end

    test "retrievability of freshly reviewed card is near 1.0" do
      card = OpenStruct.new(fsrs_stability: 5.0, fsrs_last_review_at: Time.current)
      r = @sr.retrievability(card)
      assert_in_delta 1.0, r, 0.01
    end

    test "retrievability decreases over time" do
      card = OpenStruct.new(fsrs_stability: 5.0, fsrs_last_review_at: 10.days.ago)
      r = @sr.retrievability(card)
      assert r < 1.0, "Retrievability should decrease over time"
      assert r > 0.0, "Retrievability should remain positive"
    end

    test "retrievability with zero stability returns 1.0" do
      card = OpenStruct.new(fsrs_stability: 0.0, fsrs_last_review_at: 10.days.ago)
      r = @sr.retrievability(card)
      assert_equal 1.0, r
    end

    test "rating is clamped to valid range" do
      card = new_card
      result = @sr.review(card, 0)  # Below minimum
      assert result[:fsrs_reps] == 1  # Should still work

      result = @sr.review(card, 10) # Above maximum
      assert result[:fsrs_reps] == 1  # Should still work (clamped to Easy)
    end
  end
end
