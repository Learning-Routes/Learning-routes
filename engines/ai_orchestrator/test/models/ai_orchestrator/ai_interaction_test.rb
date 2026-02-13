require "test_helper"

module AiOrchestrator
  class AiInteractionTest < ActiveSupport::TestCase
    test "requires model" do
      interaction = AiInteraction.new(model: nil, prompt: "test")
      assert_not interaction.valid?
      assert_includes interaction.errors[:model], "can't be blank"
    end

    test "requires prompt" do
      interaction = AiInteraction.new(model: "claude-opus-4-6", prompt: nil)
      assert_not interaction.valid?
      assert_includes interaction.errors[:prompt], "can't be blank"
    end

    test "validates model inclusion" do
      interaction = AiInteraction.new(model: "invalid-model", prompt: "test")
      assert_not interaction.valid?
      assert_includes interaction.errors[:model], "is not included in the list"
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
  end
end
