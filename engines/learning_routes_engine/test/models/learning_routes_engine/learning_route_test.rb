require "test_helper"

module LearningRoutesEngine
  class LearningRouteTest < ActiveSupport::TestCase
    test "requires topic" do
      route = LearningRoute.new(topic: nil)
      assert_not route.valid?
      assert_includes route.errors[:topic], "can't be blank"
    end

    test "status enum values" do
      assert_equal({ "draft" => 0, "active" => 1, "completed" => 2, "paused" => 3 }, LearningRoute.statuses)
    end

    test "progress percentage with zero steps" do
      route = LearningRoute.new(current_step: 0, total_steps: 0)
      assert_equal 0, route.progress_percentage
    end

    test "progress percentage calculation" do
      route = LearningRoute.new(current_step: 3, total_steps: 10)
      assert_equal 30.0, route.progress_percentage
    end
  end
end
