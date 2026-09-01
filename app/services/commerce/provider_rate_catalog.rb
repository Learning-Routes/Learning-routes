# frozen_string_literal: true

module Commerce
  class ProviderRateCatalog
    def initialize(configuration)
      @versions = configuration.fetch(:provider_versions, {})
      @tavily = configuration.fetch(:tavily, {})
    end

    def missing_for(call)
      return tavily_missing if call.fetch("kind") == "tavily"

      model = call["model"].to_s
      missing = []
      pricing = AiOrchestrator::CostTracker::PRICING[model]
      missing << "provider_rates.#{model}" if pricing.nil? || pricing[:provider_reported_credits] || pricing[:flat] == 0
      missing << "provider_versions.#{model}" if @versions[model].blank?
      missing
    end

    def estimate_microcents(call)
      calls = call.fetch("calls")
      return calls * call.fetch("credits") * @tavily.fetch(:microcents_per_credit) if call.fetch("kind") == "tavily"

      usage = case call.fetch("kind")
      when "text"
        { input_tokens: call.fetch("input_tokens"), output_tokens: call.fetch("output_tokens") }
      when "image"
        { input_tokens: call.fetch("input_tokens"), image_input_tokens: call.fetch("image_input_tokens"),
          output_tokens: call.fetch("output_tokens") }
      when "tts"
        { characters: call.fetch("characters") }
      when "stt"
        { audio_seconds: call.fetch("audio_seconds") }
      else
        raise KeyError, "unsupported call kind"
      end
      calls * AiOrchestrator::CostTracker.estimate_microcents(model: call.fetch("model"), **usage)
    end

    def versions_for(calls)
      models = calls.filter_map { |call| call["model"] }.uniq
      @versions.slice(*models).merge("tavily" => @tavily[:version]).compact
    end

    private

    def tavily_missing
      missing = []
      rate = @tavily[:microcents_per_credit]
      missing << "tavily.microcents_per_credit" unless rate.is_a?(Integer) && rate.positive?
      missing << "tavily.version" if @tavily[:version].blank?
      missing
    end
  end
end
