require "test_helper"

module AiOrchestrator
  class AiClientTest < ActiveSupport::TestCase
    test "identifies RubyLLM models correctly" do
      AiClient::RUBY_LLM_MODELS.each do |model|
        assert_includes AiInteraction::SUPPORTED_MODELS, model,
          "RubyLLM model #{model} should be in SUPPORTED_MODELS"
      end
    end

    test "all text models are in RUBY_LLM_MODELS" do
      text_models = %w[gpt-5.2 gpt-5.1-codex-mini claude-opus-4-6 claude-haiku-4-5 claude-sonnet-4-5]
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
      client = AiClient.new(model: "claude-opus-4-6", task_type: "route_generation")
      assert_not_nil client
    end
  end
end
