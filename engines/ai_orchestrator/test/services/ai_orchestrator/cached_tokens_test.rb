require "test_helper"

module AiOrchestrator
  # Since ruby_llm 1.15, OpenAI Message#input_tokens is prompt_tokens minus the
  # cached (and cache-write) tokens; in 1.11 it was the full prompt_tokens. Every
  # reader of input_tokens must add cached_tokens back, priced at the cached rate.
  class CachedTokensTest < ActiveSupport::TestCase
    USAGE = {
      prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100,
      prompt_tokens_details: { cached_tokens: 800 }
    }.freeze

    setup do
      @original_openai_key = RubyLLM.config.openai_api_key
      RubyLLM.config.openai_api_key = "test-key"
      stub_request(:post, "https://api.openai.com/v1/chat/completions").to_return(
        status: 200, headers: { "Content-Type" => "application/json" },
        body: {
          id: "chatcmpl-1", object: "chat.completion", model: "gpt-4.1-mini",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "ok" } }],
          usage: USAGE
        }.to_json
      )
    end

    teardown { RubyLLM.config.openai_api_key = @original_openai_key }

    test "AiClient reports uncached and cached prompt tokens separately" do
      result = AiClient.new(model: "gpt-4.1-mini").chat(prompt: "hi")

      assert_equal 200, result[:input_tokens]
      assert_equal 800, result[:cached_tokens]
    end

    test "ContentAgent#usage_totals includes the cached tokens" do
      agent = ContentAgent.new(model: "gpt-4.1-mini")
      agent.ask("hi")

      assert_equal [200, 100, 800, 0], agent.usage_totals
    end

    test "LessonAssistantAgent aggregates the cached tokens" do
      chat = RubyLLM.chat(model: "gpt-4.1-mini")
      chat.ask("hi")
      agent = ContentEngine::LessonAssistantAgent.allocate

      assert_equal [200, 100, 800, 0], agent.send(:aggregate_usage, chat.messages)
    end

    test "the interaction records cached tokens and prices them at the cached rate" do
      interaction = AiInteraction.create!(model: "gpt-4.1-mini", prompt: "hi", status: :processing)
      result = AiClient.new(model: "gpt-4.1-mini").chat(prompt: "hi")

      interaction.mark_completed!(
        response_text: result[:content], input_tokens: result[:input_tokens],
        cached_tokens: result[:cached_tokens], output_tokens: result[:output_tokens]
      )

      assert_equal 800, interaction.cached_tokens
      assert_equal 1100, interaction.tokens_used
      assert_equal 1100, interaction.total_tokens
      # 200 x 40c/M + 800 x 10c/M + 100 x 160c/M = 32_000 c/M = 320 microcents
      assert_equal 320, interaction.cost_microcents
    end

    test "every token-priced model has a cached input rate" do
      CostTracker::PRICING.each do |model, pricing|
        next unless pricing.key?(:input)

        assert pricing.key?(:cached_input), "#{model} has no cached_input rate"
        assert_operator pricing[:cached_input], :<, pricing[:input], model
      end
    end
  end
end
