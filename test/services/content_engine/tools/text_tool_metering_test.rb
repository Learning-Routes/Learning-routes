require "test_helper"

class ContentEngine::Tools::TextToolMeteringTest < ActiveSupport::TestCase
  setup do
    @client = Object.new
    @client.define_singleton_method(:chat) do |**|
      { content: "flowchart TD\nA-->B", input_tokens: 1_000, output_tokens: 500, latency_ms: 2 }
    end
    singleton = AiOrchestrator::AiClient.singleton_class
    singleton.alias_method :_original_new_for_text_tools_test, :new
    client = @client
    AiOrchestrator::AiClient.define_singleton_method(:new) { |**| client }
  end

  teardown do
    singleton = AiOrchestrator::AiClient.singleton_class
    singleton.alias_method :new, :_original_new_for_text_tools_test
    singleton.remove_method :_original_new_for_text_tools_test
  end

  test "every direct paid text tool persists its own exact billable row" do
    execute(ContentEngine::Tools::TranslateContent.new,
            content: "content", from_locale: "en", to_locale: "es")
    execute(ContentEngine::Tools::SimplifyExplanation.new, content: "content")
    execute(ContentEngine::Tools::GenerateDiagram.new, description: "process")
    execute(ContentEngine::Tools::GenerateCodeExample.new, concept: "loop")

    rows = AiOrchestrator::AiInteraction.where(model: "gpt-4.1-mini")
    assert_equal 4, rows.count
    assert rows.all? { |row| row.pricing_status == "priced" }
    assert rows.all? { |row| row.cost_microcents == 1_200 }
    assert_equal %w[code_generation diagram_generation simplify_content translation],
                 rows.order(:task_type).pluck(:task_type)
  end

  private

  def execute(tool, **attributes)
    result = tool.execute(**attributes)
    result.is_a?(RubyLLM::Tool::Halt) ? result.content : result
  end
end
