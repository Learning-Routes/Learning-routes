require "test_helper"

# The content tools' successful output is the answer: it ends the turn and is
# never sent back to the model (generate_image's is a data URL). ruby_llm 1.x
# did this with halt; 2.x removed it, so the callers run the loop.
class ContentEngine::Tools::FinalAnswerTest < ActiveSupport::TestCase
  COMPLETIONS = "https://api.openai.com/v1/chat/completions".freeze
  IMAGE = "![a cell](data:image/png;base64,aW1hZ2U=)".freeze

  setup do
    @original_openai_key = RubyLLM.config.openai_api_key
    RubyLLM.config.openai_api_key = "test-key"
    @original_env_key = ENV["OPENAI_API_KEY"]
    ENV["OPENAI_API_KEY"] = "test-key"

    tool_call = {
      id: "call_1", type: "function",
      function: { name: ContentEngine::Tools::GenerateImage.new.name, arguments: { description: "a cell" }.to_json }
    }
    stub_request(:post, COMPLETIONS).to_return(
      completion(message: { role: "assistant", content: nil, tool_calls: [tool_call] }, finish_reason: "tool_calls"),
      completion(message: { role: "assistant", content: "the model was asked again" }, finish_reason: "stop")
    )
    stub_request(:post, "https://api.openai.com/v1/images/generations").to_return(
      status: 200, headers: { "Content-Type" => "application/json" },
      body: { data: [{ b64_json: "aW1hZ2U=" }],
              usage: { output_tokens: 3, input_tokens_details: { text_tokens: 1, image_tokens: 2 } } }.to_json
    )
  end

  teardown do
    RubyLLM.config.openai_api_key = @original_openai_key
    ENV["OPENAI_API_KEY"] = @original_env_key
  end

  test "ContentAgent: a tool's output ends the turn after one completion request" do
    response = AiOrchestrator::ContentAgent.new(model: "gpt-4.1-mini").ask("Draw a cell")

    assert_equal IMAGE, response.content
    assert_requested :post, COMPLETIONS, times: 1
  end

  test "the lesson assistant's session: a tool's output ends the turn after one completion request" do
    chat = AiOrchestrator::AiClient.new(model: "gpt-4.1-mini")
      .chat_session(tools: ContentEngine::LessonAssistantAgent::TOOLS)

    response = ContentEngine::Tools::Final.ask(chat, "Draw a cell")

    assert_equal IMAGE, response.content
    assert_requested :post, COMPLETIONS, times: 1
  end

  private

  def completion(message:, finish_reason:)
    { status: 200, headers: { "Content-Type" => "application/json" },
      body: { id: "chatcmpl-1", object: "chat.completion", model: "gpt-4.1-mini",
              choices: [{ index: 0, finish_reason: finish_reason, message: message }],
              usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }.to_json }
  end
end
