require "test_helper"

module AiOrchestrator
  class CostTrackerTest < ActiveSupport::TestCase
    test "estimates cost for claude-opus-4-6" do
      cost = CostTracker.estimate_cost(model: "claude-opus-4-6", input_tokens: 1000, output_tokens: 500)
      assert cost >= 0
    end

    test "estimates cost for image model" do
      cost = CostTracker.estimate_cost(model: "nanobanana-pro")
      assert_equal 10, cost
    end

    test "returns 0 for unknown model" do
      cost = CostTracker.estimate_cost(model: "unknown")
      assert_equal 0, cost
    end
  end
end
