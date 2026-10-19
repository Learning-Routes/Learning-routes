require "test_helper"

module AiOrchestrator
  # ruby_llm's tokens.input excludes the tokens written to the prompt cache
  # (tokens.cache_write). Anthropic bills them at its 5-minute cache-write rate,
  # 1.25x input; OpenAI's gpt-5.2, gpt-4.1-mini and gpt-image-1 charge no
  # cache-write fee, so there they bill as plain input.
  class CacheWriteTokensTest < ActiveSupport::TestCase
    setup do
      @original_anthropic_key = RubyLLM.config.anthropic_api_key
      RubyLLM.config.anthropic_api_key = "test-key"
      stub_request(:post, "https://api.anthropic.com/v1/messages").to_return(
        status: 200, headers: { "Content-Type" => "application/json" },
        body: {
          id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-4-5",
          content: [{ type: "text", text: "ok" }], stop_reason: "end_turn",
          usage: { input_tokens: 100, cache_creation_input_tokens: 400, cache_read_input_tokens: 0, output_tokens: 50 }
        }.to_json
      )
    end

    teardown { RubyLLM.config.anthropic_api_key = @original_anthropic_key }

    test "AiClient reports the cache-write tokens apart from input" do
      result = AiClient.new(model: "claude-haiku-4-5").chat(prompt: "hi")

      assert_equal [100, 400], result.values_at(:input_tokens, :cache_write_tokens)
    end

    test "ContentAgent#usage_totals and the lesson assistant include the cache-write tokens" do
      agent = ContentAgent.new(model: "claude-haiku-4-5")
      agent.ask("hi")

      assert_equal [100, 50, 0, 400], agent.usage_totals
      assert_equal [100, 50, 0, 400],
        ContentEngine::LessonAssistantAgent.allocate.send(:aggregate_usage, agent.messages)
    end

    test "the interaction records cache-write tokens and prices them at Anthropic's cache-write rate" do
      interaction = AiInteraction.create!(model: "claude-haiku-4-5", prompt: "hi", status: :processing)
      result = AiClient.new(model: "claude-haiku-4-5").chat(prompt: "hi")

      interaction.mark_completed!(
        response_text: result[:content], input_tokens: result[:input_tokens], cached_tokens: result[:cached_tokens],
        cache_write_tokens: result[:cache_write_tokens], output_tokens: result[:output_tokens]
      )

      assert_equal 400, interaction.cache_write_tokens
      assert_equal 550, interaction.tokens_used
      assert_equal 550, interaction.total_tokens
      # 100 x 100c/M + 400 x 125c/M + 50 x 500c/M = 85_000 c/M = 850 microcents
      assert_equal 850, interaction.cost_microcents
    end

    test "Anthropic models carry their cache-write rate, 1.25x input" do
      %w[claude-opus-4-5 claude-sonnet-4-5 claude-haiku-4-5].each do |model|
        pricing = CostTracker::PRICING.fetch(model)
        assert_equal pricing[:input] * 5 / 4r, pricing[:cache_write], model
      end
    end

    test "a model without a cache-write fee bills its cache writes as input" do
      assert_equal 400, CostTracker.estimate_microcents(model: "gpt-4.1-mini", cache_write_tokens: 1_000)
    end
  end
end
