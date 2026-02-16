require "ostruct"
require "test_helper"

module LearningRoutesEngine
  class GapAnalysisJobTest < ActiveJob::TestCase
    setup do
      @fixture_path = File.expand_path("../../fixtures/files/gap_analysis_response.json", __dir__)
      @ai_response = File.read(@fixture_path)
      @user = Core::User.create!(
        email: "gap_job_test_#{SecureRandom.hex(4)}@example.com",
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

    test "enqueues reinforcement job when gaps found" do
      interaction = OpenStruct.new(
        id: SecureRandom.uuid,
        status: "completed",
        response: @ai_response,
        model: "claude-opus-4-6",
        completed?: true
      )

      original = AiOrchestrator::Orchestrate.method(:call)
      AiOrchestrator::Orchestrate.define_singleton_method(:call) { |**_args| interaction }

      assert_enqueued_with(job: ReinforcementJob) do
        GapAnalysisJob.perform_now(@route.id, user_feedback: "I don't understand variables")
      end
    ensure
      AiOrchestrator::Orchestrate.define_singleton_method(:call, original)
    end

    test "does not enqueue reinforcement when no gaps" do
      # No assessment result and no feedback that would trigger gaps
      # GapAnalyzer returns [] when no sources provided
      assert_no_enqueued_jobs(only: ReinforcementJob) do
        GapAnalysisJob.perform_now(@route.id)
      end
    end
  end
end
