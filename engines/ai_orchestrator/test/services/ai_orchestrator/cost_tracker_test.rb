require "test_helper"

module AiOrchestrator
  class CostTrackerTest < ActiveSupport::TestCase
    test "estimates cost for claude-opus-4-5" do
      cost = CostTracker.estimate_cost(model: "claude-opus-4-5", input_tokens: 1_000_000, output_tokens: 0)
      assert_equal 500, cost
    end

    test "estimates output cost for claude-opus-4-5" do
      cost = CostTracker.estimate_cost(model: "claude-opus-4-5", input_tokens: 0, output_tokens: 1_000_000)
      assert_equal 2500, cost
    end

    test "estimates combined cost" do
      cost = CostTracker.estimate_cost(model: "claude-opus-4-5", input_tokens: 1000, output_tokens: 500)
      # (1000/1M * 500) + (500/1M * 2500) = 0.5 + 1.25 = 1.75 -> ceil = 2
      assert_equal 2, cost
    end

    test "estimates cost for gpt-5.2" do
      cost = CostTracker.estimate_cost(model: "gpt-5.2", input_tokens: 1_000_000, output_tokens: 1_000_000)
      assert_equal 175 + 1400, cost
    end

    test "estimates cost for haiku" do
      cost = CostTracker.estimate_cost(model: "claude-haiku-4-5", input_tokens: 1_000_000, output_tokens: 0)
      assert_equal 100, cost
    end

    test "estimates cost for image model" do
      cost = CostTracker.estimate_cost(model: "nanobanana-pro")
      assert_equal 10, cost
    end

    test "estimates cost for flash image model" do
      cost = CostTracker.estimate_cost(model: "nanobanana-flash")
      assert_equal 2, cost
    end

    test "estimates flat cost for elevenlabs" do
      cost = CostTracker.estimate_cost(model: "elevenlabs")
      assert_equal 0, cost
    end

    test "returns 0 for unknown model" do
      cost = CostTracker.estimate_cost(model: "unknown")
      assert_equal 0, cost
    end

    test "all supported models have pricing" do
      AiInteraction::SUPPORTED_MODELS.each do |model|
        assert CostTracker::PRICING.key?(model),
          "No pricing defined for model: #{model}"
      end
    end

    test "usage_summary returns expected keys" do
      summary = CostTracker.usage_summary(period: Date.current.all_month)
      expected_keys = %i[total_requests successful failed cached_hits total_cost_cents
                         total_tokens avg_latency_ms cost_by_model cost_by_task cache_hit_rate]
      expected_keys.each do |key|
        assert summary.key?(key), "Missing key: #{key}"
      end
    end

    test "check_alerts returns empty when no limits exceeded" do
      # With empty database, costs should be 0
      violations = CostTracker.check_alerts
      assert_empty violations
    end

    test "alert_exceeded? returns false when no limits exceeded" do
      assert_not CostTracker.alert_exceeded?
    end
  end
end
