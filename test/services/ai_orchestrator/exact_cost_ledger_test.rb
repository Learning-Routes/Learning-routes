require "test_helper"

module AiOrchestrator
  class ExactCostLedgerTest < ActiveSupport::TestCase
    test "preserves fractional-cent text cost and rounds compatibility cents normally" do
      assert_equal 400, CostTracker.estimate_microcents(
        model: "gpt-4.1-mini", input_tokens: 1_000
      )
      assert_equal 0, CostTracker.estimate_cost(model: "gpt-4.1-mini", input_tokens: 1_000)
    end

    test "cost dollars reads exact microcent precision" do
      interaction = AiInteraction.new(cost_cents: 1, cost_microcents: 12_500)

      assert_equal BigDecimal("0.0125"), interaction.cost_dollars
    end

    test "billable includes only completed non-cached rows" do
      completed = create_interaction(status: :completed, cost_microcents: 400)
      create_interaction(status: :completed, cached: true, cost_microcents: 400)
      create_interaction(status: :failed, cost_microcents: 400)
      create_interaction(status: :timeout, cost_microcents: 400)
      create_interaction(status: :pending, cost_microcents: 400)

      assert_equal [completed.id], AiInteraction.billable.pluck(:id)
    end

    test "exact aggregates exclude every non-billable row" do
      create_interaction(status: :completed, model: "gpt-5.2", task_type: "lesson_content",
                         cost_microcents: 12_345)
      create_interaction(status: :completed, model: "gpt-4.1-mini", task_type: "quick_grading",
                         cost_microcents: 2_000)
      create_interaction(status: :completed, cached: true, cost_microcents: 90_000)
      create_interaction(status: :failed, cost_microcents: 90_000)

      assert_equal 14_345, CostTracker.daily_cost_microcents
      assert_equal 14_345, CostTracker.weekly_cost_microcents
      assert_equal 14_345, CostTracker.monthly_cost_microcents
      assert_equal({ "gpt-5.2" => 12_345, "gpt-4.1-mini" => 2_000 },
                   CostTracker.cost_by_model_microcents)
      assert_equal({ "lesson_content" => 12_345, "quick_grading" => 2_000 },
                   CostTracker.cost_by_task_microcents)
    end

    test "completed and cached writes update exact and compatibility costs together" do
      paid = create_interaction(status: :processing, model: "gpt-4.1-mini")
      paid.mark_completed!(response_text: "ok", input_tokens: 1_000)
      assert_equal 400, paid.cost_microcents
      assert_equal 0, paid.cost_cents

      cached = create_interaction(status: :processing, model: "gpt-5.2", cached: true)
      cached.mark_completed!(response_text: "cached", input_tokens: 1_000_000)
      assert_equal 0, cached.cost_microcents
      assert_equal 0, cached.cost_cents
    end

    test "completed text with missing provider usage is explicitly unpriced" do
      interaction = create_interaction(status: :processing, model: "gpt-4.1-mini")

      interaction.mark_completed!(response_text: "ok", input_tokens: nil, output_tokens: nil)

      assert interaction.completed?
      assert_equal "unpriced", interaction.pricing_status
      assert_equal 0, interaction.cost_microcents
      assert_not_includes AiInteraction.billable, interaction
    end

    private

    def create_interaction(status:, model: "gpt-5.2", task_type: nil, cached: false,
                           cost_microcents: 0)
      AiInteraction.create!(
        model: model, prompt: "metering fixture", status: status, task_type: task_type,
        cached: cached, cost_microcents: cost_microcents,
        pricing_status: "priced",
        cost_cents: (cost_microcents.to_f / 10_000).round
      )
    end
  end
end
