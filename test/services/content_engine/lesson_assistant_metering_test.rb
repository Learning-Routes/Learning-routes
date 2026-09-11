require "test_helper"

class ContentEngine::LessonAssistantMeteringTest < ActiveSupport::TestCase
  # WP-34 §3.1. This agent called RubyLLM.chat directly, so nothing checked a
  # ceiling before it spent. The session now comes from AiClient#chat_session,
  # which runs SpendGuard.call first.
  test "a refused ceiling stops the assistant before a chat session exists" do
    agent = ContentEngine::LessonAssistantAgent.allocate
    agent.instance_variable_set(:@user, nil)
    agent.define_singleton_method(:system_prompt) { "irrelevant" }

    with_refused_guard do
      assert_raises(AiOrchestrator::SpendGuard::LimitExceeded) { agent.send(:build_chat) }
    end
  end

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

  # minitest/mock is not in this bundle; same dependency-free swap as
  # voice_evaluator_metering_test.rb and test/tasks/wp33_reparse_test.rb.
  def with_refused_guard
    original = AiOrchestrator::SpendGuard.method(:call)
    AiOrchestrator::SpendGuard.define_singleton_method(:call) do |**|
      raise AiOrchestrator::SpendGuard::LimitExceeded.new("no budget", kind: :daily_budget)
    end
    yield
  ensure
    AiOrchestrator::SpendGuard.define_singleton_method(:call, original)
  end
end
