require "ostruct"
require "test_helper"

module LearningRoutesEngine
  class ReinforcementGeneratorTest < ActiveSupport::TestCase
    setup do
      @fixture_path = File.expand_path("../../fixtures/files/reinforcement_response.json", __dir__)
      @ai_response = File.read(@fixture_path)
      @user = Core::User.create!(
        email: "reinforce_test_#{SecureRandom.hex(4)}@example.com",
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
      @route = LearningRoute.create!(
        learning_profile: @profile,
        topic: "Ruby on Rails",
        status: :active,
        current_step: 0,
        total_steps: 5
      )
      @gap = KnowledgeGap.create!(
        user: @user,
        learning_route: @route,
        topic: "ActiveRecord Associations",
        description: "Struggles with has_many :through",
        severity: :high,
        resolved: false
      )
    end

    test "generates reinforcement route for a gap" do
      with_mock_ai(@ai_response) do
        generator = ReinforcementGenerator.new(knowledge_gaps: [@gap], route: @route)
        results = generator.generate!

        assert_equal 1, results.size
        reinforcement = results.first
        assert reinforcement.persisted?
        assert reinforcement.active?
        assert reinforcement.steps.any?

        last_step = reinforcement.steps.last
        assert_equal "assessment", last_step["content_type"]
        assert last_step["title"].include?("Re-Assessment")
      end
    end

    test "step count includes reassessment" do
      with_mock_ai(@ai_response) do
        results = ReinforcementGenerator.new(knowledge_gaps: [@gap], route: @route).generate!
        # AI returns 4 steps + 1 reassessment = 5 total
        assert results.first.steps.size >= 5
      end
    end

    test "falls back to generic steps on AI failure" do
      with_mock_ai_failure do
        results = ReinforcementGenerator.new(knowledge_gaps: [@gap], route: @route).generate!

        assert_equal 1, results.size
        reinforcement = results.first
        assert reinforcement.persisted?
        assert reinforcement.steps.any?

        last_step = reinforcement.steps.last
        assert_equal "assessment", last_step["content_type"]
      end
    end

    test "low severity gets fewer steps" do
      low_gap = KnowledgeGap.create!(
        user: @user,
        learning_route: @route,
        topic: "Minor issue",
        severity: :low,
        resolved: false
      )

      with_mock_ai_failure do
        results = ReinforcementGenerator.new(knowledge_gaps: [low_gap], route: @route).generate!
        # Low severity: 2 generic steps + 1 reassessment = 3
        assert results.first.steps.size <= 4
      end
    end

    test "handles multiple gaps" do
      gap2 = KnowledgeGap.create!(
        user: @user,
        learning_route: @route,
        topic: "SQL Joins",
        severity: :medium,
        resolved: false
      )

      with_mock_ai(@ai_response) do
        results = ReinforcementGenerator.new(knowledge_gaps: [@gap, gap2], route: @route).generate!
        assert_equal 2, results.size
        assert results.all?(&:persisted?)
      end
    end

    private

    def with_mock_ai(response_text)
      interaction = OpenStruct.new(
        id: SecureRandom.uuid,
        status: "completed",
        response: response_text,
        model: "gpt-5.2",
        completed?: true
      )

      original = AiOrchestrator::Orchestrate.method(:call)
      AiOrchestrator::Orchestrate.define_singleton_method(:call) { |**_args| interaction }
      yield
    ensure
      AiOrchestrator::Orchestrate.define_singleton_method(:call, original)
    end

    def with_mock_ai_failure
      original = AiOrchestrator::Orchestrate.method(:call)
      AiOrchestrator::Orchestrate.define_singleton_method(:call) { |**_args| raise "AI unavailable" }
      yield
    ensure
      AiOrchestrator::Orchestrate.define_singleton_method(:call, original)
    end
  end
end
