require "test_helper"
require "rake"

class AiCostsTavilyTest < ActiveSupport::TestCase
  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("ai_costs:report")
    @interaction = AiOrchestrator::AiInteraction.create!(
      model: "tavily", task_type: "web_search", prompt: "tavily_search",
      status: :completed, provider_units: 2, pricing_status: "unpriced"
    )
  end

  test "report displays unpriced Tavily credits as unknown" do
    output = capture_io { invoke_task("ai_costs:report") }.first

    assert_match(/tavily.*2 credits.*unknown/i, output)
  end

  test "backfill refuses to invent a historical Tavily rate" do
    output = capture_io { invoke_task("ai_costs:backfill") }.first

    assert_match(/tavily.*2 credits.*unknown/i, output)
    assert_equal "unpriced", @interaction.reload.pricing_status
    assert_equal 0, @interaction.cost_microcents
  end

  private

  def invoke_task(name)
    task = Rake::Task[name]
    task.reenable
    task.invoke
  end
end
