require "test_helper"

# ruby_llm 2.x sends OpenAI chats to the Responses API by default. Requests and
# usage parsing stay on Chat Completions, as they were on 1.x.
class AiOrchestrator::OpenaiProtocolTest < ActiveSupport::TestCase
  setup do
    @original_openai_key = RubyLLM.config.openai_api_key
    RubyLLM.config.openai_api_key = "test-key"
    stub_request(:post, "https://api.openai.com/v1/chat/completions").to_return(
      status: 200, headers: { "Content-Type" => "application/json" },
      body: {
        id: "chatcmpl-1", object: "chat.completion", model: "gpt-4.1-mini",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "ok" } }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
      }.to_json
    )
  end

  teardown { RubyLLM.config.openai_api_key = @original_openai_key }

  test "an OpenAI chat posts to /v1/chat/completions" do
    result = AiOrchestrator::AiClient.new(model: "gpt-4.1-mini").chat(prompt: "hi")

    assert_equal "ok", result[:content]
    assert_requested :post, "https://api.openai.com/v1/chat/completions", times: 1
    assert_not_requested :post, "https://api.openai.com/v1/responses"
  end

  test "a gpt-5 request carries temperature 1.0, as on ruby_llm 1.x" do
    AiOrchestrator::AiClient.new(model: "gpt-5.2", task_type: :curriculum_design).chat(prompt: "hi")

    assert_requested(:post, "https://api.openai.com/v1/chat/completions") { |req| JSON.parse(req.body)["temperature"] == 1.0 }
  end
end
