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

    test "progress percentage reflects completed steps, not current_step" do
      # progress_percentage is completion-based (completed steps / total steps),
      # not current_step/total_steps — so it needs real persisted steps.
      user = Core::User.create!(email: "lr-#{SecureRandom.hex(4)}@example.com",
                                password: "password123", name: "LR", role: :student)
      profile = LearningProfile.create!(user: user, current_level: "beginner")
      route = LearningRoute.create!(learning_profile: profile, topic: "T", total_steps: 10)
      10.times do |i|
        RouteStep.create!(learning_route: route, position: i, title: "S#{i}",
                          status: (i < 3 ? :completed : :available))
      end
      assert_equal 30.0, route.reload.progress_percentage
    end
  end
end
