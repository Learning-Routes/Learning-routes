require "test_helper"

class ContentEngine::LessonAssistantMeteringTest < ActiveSupport::TestCase
  test "lesson assistant persists exact priced token cost" do
    step = Struct.new(:id).new(42)
    route = Struct.new(:id).new(7)
    agent = ContentEngine::LessonAssistantAgent.allocate
    agent.instance_variable_set(:@step, step)
    agent.instance_variable_set(:@route, route)
    agent.instance_variable_set(:@user, nil)

    agent.send(:track_interaction!, "simplify", "help", { type: "text", content: "answer" },
      input_tokens: 1_000, output_tokens: 500, latency_ms: 4)

    interaction = AiOrchestrator::AiInteraction.order(:id).last
    assert_equal "priced", interaction.pricing_status
    assert_equal 1_200, interaction.cost_microcents
    assert_equal "openai-2026-08-31", interaction.pricing_version
  end
end
