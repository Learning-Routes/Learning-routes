require "ostruct"
require "test_helper"

module LearningRoutesEngine
  class ContentGenerationJobTest < ActiveJob::TestCase
    setup do
      @user = Core::User.create!(
        email: "content_job_test_#{SecureRandom.hex(4)}@example.com",
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
        total_steps: 1
      )
      @step = @route.route_steps.create!(
        position: 0,
        title: "Introduction to Ruby",
        description: "Learn Ruby basics",
        level: :nv1,
        content_type: :lesson,
        status: :available,
        estimated_minutes: 30,
        bloom_level: 1
      )
    end

    test "marks step as content generated on success" do
      interaction = OpenStruct.new(
        id: SecureRandom.uuid,
        status: "completed",
        response: "<h1>Introduction to Ruby</h1><p>Ruby is a dynamic language...</p>",
        model: "claude-opus-4-6",
        completed?: true
      )

      original = AiOrchestrator::Orchestrate.method(:call)
      AiOrchestrator::Orchestrate.define_singleton_method(:call) { |**_args| interaction }

      ContentGenerationJob.perform_now(@step.id)

      @step.reload
      assert @step.metadata["content_generated"], "Step should be marked as content generated"
    ensure
      AiOrchestrator::Orchestrate.define_singleton_method(:call, original)
    end

    test "handles AI failure gracefully" do
      interaction = OpenStruct.new(
        id: SecureRandom.uuid,
        status: "failed",
        response: nil,
        model: "claude-opus-4-6",
        completed?: false
      )

      original = AiOrchestrator::Orchestrate.method(:call)
      AiOrchestrator::Orchestrate.define_singleton_method(:call) { |**_args| interaction }

      ContentGenerationJob.perform_now(@step.id)

      @step.reload
      assert_nil @step.metadata["content_generated"]
    ensure
      AiOrchestrator::Orchestrate.define_singleton_method(:call, original)
    end
  end
end
