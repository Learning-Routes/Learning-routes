require "ostruct"
require "test_helper"

module LearningRoutesEngine
  class AssessmentGenerationJobTest < ActiveJob::TestCase
    setup do
      @user = Core::User.create!(
        email: "assess_job_test_#{SecureRandom.hex(4)}@example.com",
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
        title: "Ruby Basics Quiz",
        description: "Test Ruby knowledge",
        level: :nv1,
        content_type: :assessment,
        status: :available,
        estimated_minutes: 20,
        bloom_level: 2,
        metadata: { "assessment_type" => "quiz" }
      )
    end

    test "creates assessment with questions on success" do
      ai_response = {
        "questions" => [
          { "question" => "What is Ruby?", "type" => "multiple_choice",
            "options" => ["A gem", "A language", "A framework", "A database"],
            "correct_answer" => "A language", "points" => 1,
            "explanation" => "Ruby is a programming language" },
          { "question" => "What does puts do?", "type" => "multiple_choice",
            "options" => ["Prints output", "Reads input", "Loops", "Nothing"],
            "correct_answer" => "Prints output", "points" => 1,
            "explanation" => "puts prints to stdout" }
        ]
      }.to_json

      interaction = OpenStruct.new(
        id: SecureRandom.uuid,
        status: "completed",
        response: ai_response,
        model: "claude-opus-4-6",
        completed?: true
      )

      original = AiOrchestrator::Orchestrate.method(:call)
      AiOrchestrator::Orchestrate.define_singleton_method(:call) { |**_args| interaction }

      AssessmentGenerationJob.perform_now(@step.id)

      @step.reload
      assert @step.metadata["assessment_generated"]
      assert @step.metadata["assessment_id"].present?
    ensure
      AiOrchestrator::Orchestrate.define_singleton_method(:call, original)
    end
  end
end
