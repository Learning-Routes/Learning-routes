require "test_helper"

module AiOrchestrator
  class ModelRouterTest < ActiveSupport::TestCase
    test "returns primary model for assessment_questions" do
      assert_equal "claude-opus-4-6", ModelRouter.model_for(:assessment_questions)
    end

    test "returns primary model for route_generation" do
      assert_equal "gpt-5.2", ModelRouter.model_for(:route_generation)
    end

    test "returns primary model for quick_grading" do
      assert_equal "claude-haiku-4-5", ModelRouter.model_for(:quick_grading)
    end

    test "returns fallback for assessment_questions" do
      assert_equal "gpt-5.2", ModelRouter.fallback_for(:assessment_questions)
    end

    test "returns nil fallback for voice_narration" do
      assert_nil ModelRouter.fallback_for(:voice_narration)
    end

    test "raises error for unknown task type" do
      assert_raises(ArgumentError) { ModelRouter.model_for(:unknown_task) }
    end
  end
end
