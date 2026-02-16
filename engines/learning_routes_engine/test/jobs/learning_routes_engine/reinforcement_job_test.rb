require "ostruct"
require "test_helper"

module LearningRoutesEngine
  class ReinforcementJobTest < ActiveJob::TestCase
    setup do
      @user = Core::User.create!(
        email: "reinforce_job_test_#{SecureRandom.hex(4)}@example.com",
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
        total_steps: 5
      )
    end

    test "generates reinforcement routes for unresolved gaps" do
      KnowledgeGap.create!(
        user: @user,
        learning_route: @route,
        topic: "Variables",
        severity: :medium,
        resolved: false
      )

      # Mock AI to return fallback (since it will fail)
      original = AiOrchestrator::Orchestrate.method(:call)
      AiOrchestrator::Orchestrate.define_singleton_method(:call) { |**_args| raise "AI unavailable" }

      ReinforcementJob.perform_now(@route.id)

      # Should have created a reinforcement route (via fallback)
      assert @route.reinforcement_routes.any?
    ensure
      AiOrchestrator::Orchestrate.define_singleton_method(:call, original)
    end

    test "skips when no unresolved gaps" do
      ReinforcementJob.perform_now(@route.id)
      assert @route.reinforcement_routes.none?
    end

    test "skips resolved gaps" do
      KnowledgeGap.create!(
        user: @user,
        learning_route: @route,
        topic: "Already Resolved",
        severity: :low,
        resolved: true
      )

      ReinforcementJob.perform_now(@route.id)
      assert @route.reinforcement_routes.none?
    end
  end
end
