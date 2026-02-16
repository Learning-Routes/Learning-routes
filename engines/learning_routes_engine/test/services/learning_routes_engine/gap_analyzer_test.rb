require "ostruct"
require "test_helper"

module LearningRoutesEngine
  class GapAnalyzerTest < ActiveSupport::TestCase
    setup do
      @fixture_path = File.expand_path("../../fixtures/files/gap_analysis_response.json", __dir__)
      @ai_response = File.read(@fixture_path)
      @user = Core::User.create!(
        email: "gap_test_#{SecureRandom.hex(4)}@example.com",
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
    end

    test "analyzes assessment results and creates gap records" do
      assessment_result = OpenStruct.new(
        score: 55,
        knowledge_gaps_identified: [
          { "topic" => "ActiveRecord Associations", "details" => "Missed association questions" }
        ]
      )

      with_mock_ai(@ai_response) do
        analyzer = GapAnalyzer.new(route: @route, assessment_result: assessment_result)
        gaps = analyzer.analyze!

        assert gaps.any?, "Should create gap records"
        assert gaps.all?(&:persisted?), "All gaps should be persisted"

        high_gap = gaps.find { |g| g.topic == "ActiveRecord Associations" }
        assert high_gap.present?
        assert_equal "high", high_gap.severity
      end
    end

    test "deduplicates gaps by topic keeping highest severity" do
      duplicate_response = {
        "gaps" => [
          { "topic" => "SQL Joins", "severity" => "low", "description" => "Minor issue" },
          { "topic" => "SQL Joins", "severity" => "high", "description" => "Major issue" }
        ]
      }.to_json

      with_mock_ai(duplicate_response) do
        gaps = GapAnalyzer.new(
          route: @route,
          assessment_result: OpenStruct.new(score: 50, knowledge_gaps_identified: [])
        ).analyze!
        sql_gaps = gaps.select { |g| g.topic == "SQL Joins" }
        assert_equal 1, sql_gaps.size, "Should deduplicate"
        assert_equal "high", sql_gaps.first.severity
      end
    end

    test "handles user feedback source" do
      response = { "gaps" => [{ "topic" => "User reported", "severity" => "medium", "description" => "Confusing" }] }.to_json

      with_mock_ai(response) do
        gaps = GapAnalyzer.new(route: @route, user_feedback: "I don't understand joins").analyze!
        assert gaps.any?
        assert gaps.first.identified_from.include?("user_feedback")
      end
    end

    test "falls back to basic extraction on AI failure" do
      assessment_result = OpenStruct.new(
        score: 40,
        knowledge_gaps_identified: [
          { "topic" => "ActiveRecord", "severity" => "medium", "description" => "Struggled with AR" }
        ]
      )

      with_mock_ai_failure do
        gaps = GapAnalyzer.new(route: @route, assessment_result: assessment_result).analyze!
        assert gaps.any?, "Should fall back to basic extraction"
      end
    end

    test "returns empty array when no gap sources" do
      gaps = GapAnalyzer.new(route: @route).analyze!
      assert_equal [], gaps
    end

    private

    def with_mock_ai(response_text)
      interaction = OpenStruct.new(
        id: SecureRandom.uuid,
        status: "completed",
        response: response_text,
        model: "claude-opus-4-6",
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
