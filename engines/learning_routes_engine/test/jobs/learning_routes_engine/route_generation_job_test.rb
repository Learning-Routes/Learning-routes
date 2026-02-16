require "ostruct"
require "test_helper"

module LearningRoutesEngine
  class RouteGenerationJobTest < ActiveJob::TestCase
    setup do
      @fixture_path = File.expand_path("../../fixtures/files/route_generation_response.json", __dir__)
      @ai_response = File.read(@fixture_path)
      @user = Core::User.create!(
        email: "job_test_#{SecureRandom.hex(4)}@example.com",
        password: "password123",
        name: "Test User"
      )
      @profile = LearningProfile.create!(
        user: @user,
        current_level: "beginner",
        interests: ["Ruby on Rails"],
        learning_style: ["visual"],
        goal: "Learn Rails"
      )
    end

    test "generates route and creates steps" do
      interaction = OpenStruct.new(
        id: SecureRandom.uuid,
        status: "completed",
        response: @ai_response,
        model: "gpt-5.2",
        completed?: true
      )

      original = AiOrchestrator::Orchestrate.method(:call)
      AiOrchestrator::Orchestrate.define_singleton_method(:call) { |**_args| interaction }

      RouteGenerationJob.perform_now(@profile.id)

      route = LearningRoute.last
      assert route.present?
      assert route.active?
      assert route.route_steps.any?
    ensure
      AiOrchestrator::Orchestrate.define_singleton_method(:call, original)
    end

    test "raises on generation failure for retry" do
      interaction = OpenStruct.new(
        id: SecureRandom.uuid,
        status: "failed",
        response: nil,
        model: "gpt-5.2",
        completed?: false
      )

      original = AiOrchestrator::Orchestrate.method(:call)
      AiOrchestrator::Orchestrate.define_singleton_method(:call) { |**_args| interaction }

      assert_raises(RouteGenerator::GenerationError) do
        RouteGenerationJob.perform_now(@profile.id)
      end
    ensure
      AiOrchestrator::Orchestrate.define_singleton_method(:call, original)
    end
  end
end
