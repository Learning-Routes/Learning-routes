require "test_helper"

module AiOrchestrator
  class AiInteractionTest < ActiveSupport::TestCase
    def valid_attributes
      { model: "claude-opus-4-5", prompt: "test prompt", status: :pending }
    end

    test "requires model" do
      interaction = AiInteraction.new(model: nil, prompt: "test")
      assert_not interaction.valid?
      assert_includes interaction.errors[:model], "can't be blank"
    end

    test "requires prompt" do
      interaction = AiInteraction.new(model: "claude-opus-4-5", prompt: nil)
      assert_not interaction.valid?
      assert_includes interaction.errors[:prompt], "can't be blank"
    end

    test "validates model inclusion" do
      interaction = AiInteraction.new(model: "invalid-model", prompt: "test")
      assert_not interaction.valid?
      assert_includes interaction.errors[:model], "is not included in the list"
    end

    test "accepts all supported models" do
      AiInteraction::SUPPORTED_MODELS.each do |model|
        interaction = AiInteraction.new(valid_attributes.merge(model: model))
        assert interaction.valid?, "#{model} should be valid but got: #{interaction.errors.full_messages}"
      end
    end

    test "status enum values" do
      expected = { "pending" => 0, "processing" => 1, "completed" => 2, "failed" => 3, "timeout" => 4 }
      assert_equal expected, AiInteraction.statuses
    end

    test "cost_dollars conversion" do
      interaction = AiInteraction.new(cost_cents: 150)
      assert_equal 1.5, interaction.cost_dollars
    end

    test "latency_seconds conversion" do
      interaction = AiInteraction.new(latency_ms: 2500)
      assert_equal 2.5, interaction.latency_seconds
    end

    test "latency_seconds defaults to 0 when nil" do
      interaction = AiInteraction.new(latency_ms: nil)
      assert_equal 0.0, interaction.latency_seconds
    end

    test "total_tokens sums input and output" do
      interaction = AiInteraction.new(input_tokens: 100, output_tokens: 50)
      assert_equal 150, interaction.total_tokens
    end

    test "total_tokens handles nil values" do
      interaction = AiInteraction.new(input_tokens: nil, output_tokens: nil)
      assert_equal 0, interaction.total_tokens
    end

    test "validates task_type inclusion when present" do
      interaction = AiInteraction.new(valid_attributes.merge(task_type: "invalid_task"))
      assert_not interaction.valid?
    end

    test "allows nil task_type" do
      interaction = AiInteraction.new(valid_attributes.merge(task_type: nil))
      assert interaction.valid?
    end

    test "accepts valid task_types" do
      AiModelConfig::TASK_TYPES.each do |task|
        interaction = AiInteraction.new(valid_attributes.merge(task_type: task))
        assert interaction.valid?, "#{task} should be a valid task_type"
      end
    end

    test "scopes: by_model" do
      assert_equal "claude-opus-4-5", AiInteraction.by_model("claude-opus-4-5").where_values_hash["model"]
    end

    test "scopes: by_task" do
      assert_equal "route_generation", AiInteraction.by_task("route_generation").where_values_hash["task_type"]
    end
  end
end
