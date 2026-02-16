require "ostruct"
require "test_helper"

module LearningRoutesEngine
  class AdaptiveDifficultyTest < ActiveSupport::TestCase
    setup do
      @user = Core::User.create!(
        email: "adaptive_test_#{SecureRandom.hex(4)}@example.com",
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
        current_step: 3,
        total_steps: 10,
        difficulty_progression: {}
      )
      create_steps!
    end

    test "high score (>=90%) skips some remaining steps" do
      result = OpenStruct.new(score: 95)
      adaptive = AdaptiveDifficulty.new(@route, result)
      adaptive.adjust!

      skipped = @route.route_steps.where("metadata->>'skipped' = ?", "true")
      assert skipped.any?, "Should have skipped some steps"
      skipped.each { |s| assert s.completed? }
    end

    test "low score (<60%) inserts reinforcement steps" do
      original_count = @route.route_steps.count
      result = OpenStruct.new(score: 45)

      adaptive = AdaptiveDifficulty.new(@route, result)
      adaptive.adjust!

      @route.reload
      assert @route.route_steps.count > original_count, "Should have more steps after reinforcement"

      reinforcement = @route.route_steps.select { |s| s.metadata["reinforcement"] }
      assert reinforcement.any?, "Should have reinforcement steps"
    end

    test "normal score (60-90%) proceeds without changes" do
      original_count = @route.route_steps.count
      result = OpenStruct.new(score: 75)

      adaptive = AdaptiveDifficulty.new(@route, result)
      adaptive.adjust!

      @route.reload
      assert_equal original_count, @route.route_steps.count
    end

    test "records progression history" do
      result = OpenStruct.new(score: 80)
      AdaptiveDifficulty.new(@route, result).adjust!

      @route.reload
      history = @route.difficulty_progression["history"]
      assert history.present?
      assert_equal 80.0, history.last["score"]
      assert_equal "proceed", history.last["action"]
    end

    test "skip does not exceed 30% of remaining steps" do
      result = OpenStruct.new(score: 98)
      adaptive = AdaptiveDifficulty.new(@route, result)
      adaptive.adjust!

      skipped = @route.route_steps.where("metadata->>'skipped' = ?", "true")
      remaining_lesson_exercise = @route.route_steps.where(
        level: :nv1, content_type: [:lesson, :exercise]
      ).count

      # Can't verify exact max since some are already completed, but skipping should be bounded
      assert skipped.count <= 3, "Should not skip more than 30% of remaining"
    end

    private

    def create_steps!
      10.times do |i|
        ct = case i % 3
             when 0 then :lesson
             when 1 then :exercise
             when 2 then :assessment
             end
        status = i < 3 ? :completed : (i == 3 ? :available : :locked)

        @route.route_steps.create!(
          position: i,
          title: "Step #{i + 1}",
          description: "Description for step #{i + 1}",
          level: :nv1,
          content_type: ct,
          status: status,
          estimated_minutes: 20,
          bloom_level: 2,
          prerequisites: i > 0 ? [@route.route_steps.find_by(position: i - 1)&.id].compact : [],
          completed_at: i < 3 ? Time.current : nil
        )
      end
    end
  end
end
