require "ostruct"
require "test_helper"

module LearningRoutesEngine
  class RouteProgressTrackerTest < ActiveSupport::TestCase
    setup do
      @user = Core::User.create!(
        email: "progress_test_#{SecureRandom.hex(4)}@example.com",
        password: "password123",
        name: "Test User"
      )
      @profile = LearningProfile.create!(
        user: @user,
        current_level: "beginner",
        interests: ["Ruby"],
        learning_style: ["visual"],
        goal: "Learn Ruby"
      )
      @route = LearningRoute.create!(
        learning_profile: @profile,
        topic: "Ruby",
        status: :active,
        current_step: 0,
        total_steps: 3
      )
      @step1 = @route.route_steps.create!(
        position: 0, title: "Step 1", level: :nv1,
        content_type: :lesson, status: :available,
        estimated_minutes: 30, bloom_level: 1, prerequisites: []
      )
      @step2 = @route.route_steps.create!(
        position: 1, title: "Step 2", level: :nv1,
        content_type: :exercise, status: :locked,
        estimated_minutes: 20, bloom_level: 2,
        prerequisites: [@step1.id]
      )
      @step3 = @route.route_steps.create!(
        position: 2, title: "Step 3", level: :nv1,
        content_type: :assessment, status: :locked,
        estimated_minutes: 15, bloom_level: 2,
        prerequisites: [@step2.id]
      )

      @tracker = RouteProgressTracker.new(@route)
    end

    test "complete_step marks step as completed and initializes FSRS" do
      @tracker.complete_step!(@step1)

      @step1.reload
      assert @step1.completed?
      assert @step1.fsrs_stability > 0, "FSRS stability should be initialized"
      assert @step1.fsrs_next_review_at.present?, "FSRS next review should be set"
      assert_equal 1, @step1.fsrs_reps
    end

    test "complete_step unlocks next step" do
      @tracker.complete_step!(@step1)

      @step2.reload
      assert @step2.available?, "Step 2 should be unlocked after Step 1 completes"

      @step3.reload
      assert @step3.locked?, "Step 3 should still be locked"
    end

    test "complete_step advances current_step" do
      @tracker.complete_step!(@step1)

      @route.reload
      assert_equal 1, @route.current_step
    end

    test "completing all steps marks route as completed" do
      @tracker.complete_step!(@step1)
      @step2.reload
      @tracker.complete_step!(@step2)
      @step3.reload
      @tracker.complete_step!(@step3)

      @route.reload
      assert @route.completed?
    end

    test "record_review updates FSRS state" do
      @tracker.complete_step!(@step1)
      original_stability = @step1.reload.fsrs_stability

      @tracker.record_review!(@step1, SpacedRepetition::GOOD)

      @step1.reload
      assert @step1.fsrs_reps >= 2
      assert @step1.fsrs_stability != original_stability
    end

    test "progress_summary returns correct stats" do
      @tracker.complete_step!(@step1)

      summary = @tracker.progress_summary
      assert_equal 3, summary[:total_steps]
      assert_equal 1, summary[:completed_steps]
      assert_in_delta 33.3, summary[:percentage], 0.1
      assert_equal 35, summary[:remaining_minutes]  # 20 + 15
    end

    test "available_steps returns only available steps" do
      available = @tracker.available_steps
      assert_equal 1, available.count
      assert_equal @step1, available.first
    end
  end
end
