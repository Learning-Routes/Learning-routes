require "test_helper"

module Commerce
  class ProviderRateCatalogTest < ActiveSupport::TestCase
    test "uses exact WP-7 text image TTS STT and Tavily arithmetic" do
      catalog = ProviderRateCatalog.new(configuration)

      assert_equal 2, catalog.estimate_microcents(call("text", "gpt-4.1-mini",
        input_tokens: 1, output_tokens: 1))
      assert_equal 55, catalog.estimate_microcents(call("image", "gpt-image-1",
        input_tokens: 1, image_input_tokens: 1, output_tokens: 1))
      assert_equal 100, catalog.estimate_microcents(call("tts", "eleven_multilingual_v2",
        characters: 1))
      assert_equal 61, catalog.estimate_microcents(call("stt", "scribe_v2", audio_seconds: 1))
      assert_equal 75_000, catalog.estimate_microcents(
        { "kind" => "tavily", "calls" => 1, "credits" => 3 }
      )
    end

    test "requires canonical rates and explicit versions" do
      catalog = ProviderRateCatalog.new(configuration.merge(provider_versions: {}))

      assert_includes catalog.missing_for(call("text", "gpt-4.1-mini",
        input_tokens: 1, output_tokens: 1)), "provider_versions.gpt-4.1-mini"
      assert_includes catalog.missing_for(call("text", "unknown-model",
        input_tokens: 1, output_tokens: 1)), "provider_rates.unknown-model"
      assert_includes catalog.missing_for(call("text", "elevenlabs",
        input_tokens: 1, output_tokens: 1)), "provider_rates.elevenlabs"
    end

    test "snapshots changed provider versions without changing old results" do
      first = ProviderRateCatalog.new(configuration)
      changed = configuration.deep_dup
      changed[:provider_versions]["gpt-4.1-mini"] = "openai-next"
      second = ProviderRateCatalog.new(changed)
      calls = [call("text", "gpt-4.1-mini", input_tokens: 1, output_tokens: 1)]

      assert_equal "openai-2026-08-31", first.versions_for(calls).fetch("gpt-4.1-mini")
      assert_equal "openai-next", second.versions_for(calls).fetch("gpt-4.1-mini")
      assert_equal first.estimate_microcents(calls.first), second.estimate_microcents(calls.first)
    end

    private

    def call(kind, model, usage)
      { "kind" => kind, "model" => model, "calls" => 1 }.merge(usage.transform_keys(&:to_s))
    end

    def configuration
      {
        provider_versions: {
          "gpt-4.1-mini" => "openai-2026-08-31",
          "gpt-image-1" => "openai-2026-08-31",
          "eleven_multilingual_v2" => "elevenlabs-2026-08-31",
          "scribe_v2" => "elevenlabs-2026-08-31",
          "elevenlabs" => "legacy"
        },
        tavily: { microcents_per_credit: 25_000, version: "tavily-v1" }
      }
    end
  end
end
