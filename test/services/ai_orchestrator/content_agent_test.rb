# frozen_string_literal: true

require "test_helper"

class AiOrchestrator::ContentAgentTest < ActiveSupport::TestCase
  # These tests only exercise ContentAgent's static config + tool wiring (no
  # network). RubyLLM.chat still raises ConfigurationError unless an OpenAI key
  # is configured, and the test env has no credentials master key — so set a
  # dummy key. Saved/restored to avoid leaking into other tests.
  setup do
    @original_openai_key = RubyLLM.config.openai_api_key
    RubyLLM.config.openai_api_key = "test-key"
  end

  teardown do
    RubyLLM.config.openai_api_key = @original_openai_key
  end

  test "TOOL_CLASSES contains all 8 tool classes" do
    expected = [
      ContentEngine::Tools::WebSearch,
      ContentEngine::Tools::GenerateImage,
      ContentEngine::Tools::GenerateDiagram,
      ContentEngine::Tools::GenerateCodeExample,
      ContentEngine::Tools::AudioNarration,
      ContentEngine::Tools::UserProgress,
      ContentEngine::Tools::SimplifyExplanation,
      ContentEngine::Tools::TranslateContent
    ]

    assert_equal expected, AiOrchestrator::ContentAgent::TOOL_CLASSES
  end

  test "MODEL is gpt-5.2" do
    assert_equal "gpt-5.2", AiOrchestrator::ContentAgent::MODEL
  end

  test "TEMPERATURE is 0.75" do
    assert_in_delta 0.75, AiOrchestrator::ContentAgent::TEMPERATURE
  end

  test "DEFAULT_PARAMS includes max_completion_tokens" do
    assert_equal({ max_completion_tokens: 8192 }, AiOrchestrator::ContentAgent::DEFAULT_PARAMS)
  end

  test "instructions mention educational content" do
    assert_match(/educational content/i, AiOrchestrator::ContentAgent::INSTRUCTIONS)
  end

  test "instructions reference all 8 tools by name" do
    instructions = AiOrchestrator::ContentAgent::INSTRUCTIONS
    %w[web_search generate_image generate_diagram generate_code_example
       audio_narration user_progress simplify_explanation translate_content].each do |tool_name|
      assert_match(/#{tool_name}/, instructions, "Instructions should mention #{tool_name}")
    end
  end

  test "initializes a chat with correct model and tools" do
    agent = AiOrchestrator::ContentAgent.new

    assert_instance_of RubyLLM::Chat, agent.chat
    assert_equal "gpt-5.2", agent.model.id

    # Verify all 8 tools are registered on the chat
    tool_names = agent.tools.keys.map(&:to_s)
    assert_equal 8, tool_names.size, "Should have exactly 8 tools registered"
    %w[web_search generate_image generate_diagram generate_code_example
       audio_narration user_progress simplify_explanation translate_content].each do |short_name|
      assert tool_names.any? { |t| t.end_with?(short_name) }, "Chat should have tool ending with: #{short_name}"
    end
  end

  test "accepts model override" do
    agent = AiOrchestrator::ContentAgent.new(model: "gpt-4.1-mini")
    assert_equal "gpt-4.1-mini", agent.model.id
  end

  test "accepts additional params" do
    agent = AiOrchestrator::ContentAgent.new(params: { top_p: 0.9 })
    assert_instance_of RubyLLM::Chat, agent.chat
  end

  test "delegates messages to chat" do
    agent = AiOrchestrator::ContentAgent.new
    assert_respond_to agent, :messages
    assert_kind_of Array, agent.messages
  end
end
