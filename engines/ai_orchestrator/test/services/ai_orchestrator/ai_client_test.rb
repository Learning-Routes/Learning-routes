require "test_helper"

module AiOrchestrator
  class AiClientTest < ActiveSupport::TestCase
    setup do
      @original_openai_key = ENV["OPENAI_API_KEY"]
      ENV["OPENAI_API_KEY"] = "test-key"
    end

    teardown do
      ENV["OPENAI_API_KEY"] = @original_openai_key
    end

    test "identifies RubyLLM models correctly" do
      AiClient::RUBY_LLM_MODELS.each do |model|
        assert_includes AiInteraction::SUPPORTED_MODELS, model,
          "RubyLLM model #{model} should be in SUPPORTED_MODELS"
      end
    end

    test "all text models are in RUBY_LLM_MODELS" do
      text_models = %w[gpt-5.2 gpt-4.1-mini claude-opus-4-5 claude-haiku-4-5 claude-sonnet-4-5]
      text_models.each do |model|
        assert_includes AiClient::RUBY_LLM_MODELS, model
      end
    end

    test "raises RequestError for unsupported model" do
      client = AiClient.new(model: "totally-fake-model")
      assert_raises(AiClient::RequestError) do
        client.chat(prompt: "test")
      end
    end

    test "initializes with model and optional params" do
      client = AiClient.new(model: "claude-opus-4-5", task_type: "route_generation")
      assert_not_nil client
    end

    test "image response returns provider usage dimensions" do
      stub_image_response(
        data: [{ b64_json: Base64.strict_encode64("image") }],
        usage: {
          input_tokens: 70, output_tokens: 1_056,
          input_tokens_details: { text_tokens: 60, image_tokens: 10 }
        }
      )

      result = AiClient.new(model: "gpt-image-1", task_type: :image_generation)
        .chat(prompt: "illustration", params: { quality: "medium" })

      assert_equal 60, result[:input_tokens]
      assert_equal 10, result[:image_input_tokens]
      assert_equal 1_056, result[:output_tokens]
      assert_equal "image/png", result[:content_type]
    end

    test "image request rejects non-success invalid JSON missing image and missing usage" do
      stub_request(:post, "https://api.openai.com/v1/images/generations").to_return(status: 500, body: "error")
      assert_raises(AiClient::RequestError) { image_client.chat(prompt: "illustration") }

      stub_request(:post, "https://api.openai.com/v1/images/generations").to_return(status: 200, body: "{")
      assert_raises(AiClient::RequestError) { image_client.chat(prompt: "illustration") }

      stub_image_response(data: [{}], usage: { input_tokens: 1, output_tokens: 1 })
      assert_raises(AiClient::RequestError) { image_client.chat(prompt: "illustration") }

      stub_image_response(data: [{ b64_json: "abc" }])
      assert_raises(AiClient::RequestError) { image_client.chat(prompt: "illustration") }
    end

    test "image timeout remains a timeout error" do
      stub_request(:post, "https://api.openai.com/v1/images/generations").to_timeout
      assert_raises(AiClient::TimeoutError) { image_client.chat(prompt: "illustration") }
    end

    private

    def image_client
      AiClient.new(model: "gpt-image-1", task_type: :image_generation)
    end

    def stub_image_response(payload)
      stub_request(:post, "https://api.openai.com/v1/images/generations")
        .to_return(status: 200, body: payload.to_json, headers: { "Content-Type" => "application/json" })
    end
  end
end
