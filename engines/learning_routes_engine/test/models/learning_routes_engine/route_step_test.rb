require "test_helper"

module LearningRoutesEngine
  class RouteStepTest < ActiveSupport::TestCase
    test "requires title" do
      step = RouteStep.new(title: nil)
      assert_not step.valid?
      assert_includes step.errors[:title], "can't be blank"
    end

    test "requires position" do
      step = RouteStep.new(position: nil)
      assert_not step.valid?
      assert_includes step.errors[:position], "can't be blank"
    end

    test "level enum values" do
      assert_equal({ "nv1" => 0, "nv2" => 1, "nv3" => 2 }, RouteStep.levels)
    end

    test "content_type enum values" do
      assert_equal({ "lesson" => 0, "exercise" => 1, "assessment" => 2, "review" => 3 }, RouteStep.content_types)
    end

    test "status enum values" do
      assert_equal({ "locked" => 0, "available" => 1, "in_progress" => 2, "completed" => 3 }, RouteStep.statuses)
    end
  end
end
