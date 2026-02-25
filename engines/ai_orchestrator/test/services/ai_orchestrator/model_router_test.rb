require "test_helper"

module AiOrchestrator
  class ModelRouterTest < ActiveSupport::TestCase
    test "returns primary model for assessment_questions" do
      assert_equal "gpt-5.2", ModelRouter.model_for(:assessment_questions)
    end

    test "returns primary model for route_generation" do
      assert_equal "gpt-5.2", ModelRouter.model_for(:route_generation)
    end

    test "returns primary model for quick_grading" do
      assert_equal "gpt-5.1-codex-mini", ModelRouter.model_for(:quick_grading)
    end

    test "returns primary model for voice_narration" do
      assert_equal "gpt-5.1-codex-mini", ModelRouter.model_for(:voice_narration)
    end

    test "returns primary model for image_generation" do
      assert_equal "nanobanana-pro", ModelRouter.model_for(:image_generation)
    end

    test "returns fallback for assessment_questions" do
      assert_equal "gpt-5.1-codex-mini", ModelRouter.fallback_for(:assessment_questions)
    end

    test "returns fallback for voice_narration" do
      assert_equal "gpt-5.2", ModelRouter.fallback_for(:voice_narration)
    end

    test "returns fallback for image_generation" do
      assert_equal "nanobanana-flash", ModelRouter.fallback_for(:image_generation)
    end

    test "raises error for unknown task type" do
      assert_raises(ArgumentError) { ModelRouter.model_for(:unknown_task) }
    end

    test "all task types in routing table have valid models" do
      ModelRouter::ROUTING_TABLE.each do |task_type, config|
        assert_includes AiInteraction::SUPPORTED_MODELS, config[:primary],
          "Primary model for #{task_type} not in SUPPORTED_MODELS"
        if config[:fallback]
          assert_includes AiInteraction::SUPPORTED_MODELS, config[:fallback],
            "Fallback model for #{task_type} not in SUPPORTED_MODELS"
        end
      end
    end

    test "all task types have rate limits for their models" do
      ModelRouter::ROUTING_TABLE.each do |task_type, config|
        assert ModelRouter::RATE_LIMITS.key?(config[:primary]),
          "No rate limit for primary model #{config[:primary]} (task: #{task_type})"
      end
    end

    test "execute yields primary model" do
      router = ModelRouter.new(task_type: :quick_grading)
      yielded_model = nil

      # Stub rate limit and cost limit checks
      Rails.cache.clear

      router.execute do |model, params|
        yielded_model = model
        "success"
      end

      assert_equal "gpt-5.1-codex-mini", yielded_model
    end

    test "execute falls back when primary raises" do
      router = ModelRouter.new(task_type: :assessment_questions)
      models_tried = []

      Rails.cache.clear

      router.execute do |model, params|
        models_tried << model
        raise "API error" if model == "gpt-5.2"
        "fallback success"
      end

      assert_equal ["gpt-5.2", "gpt-5.1-codex-mini"], models_tried
    end

    test "execute raises AllModelsUnavailable when both fail" do
      router = ModelRouter.new(task_type: :assessment_questions)
      Rails.cache.clear

      assert_raises(ModelRouter::AllModelsUnavailable) do
        router.execute do |model, params|
          raise "API error for #{model}"
        end
      end
    end

    test "execute raises AllModelsUnavailable when both models fail" do
      router = ModelRouter.new(task_type: :voice_narration)
      Rails.cache.clear

      assert_raises(ModelRouter::AllModelsUnavailable) do
        router.execute do |model, params|
          raise "API error"
        end
      end
    end
  end
end
