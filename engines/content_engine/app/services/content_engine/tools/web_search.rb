# frozen_string_literal: true

require "net/http"
require "json"

module ContentEngine
  module Tools
    class WebSearch < RubyLLM::Tool
      description "Searches the web for current information on a topic. " \
                  "Use this when the lesson needs up-to-date facts, statistics, " \
                  "recent developments, or real-world context that may not be in training data."

      param :query, desc: "Search query — be specific and educational, e.g. 'photosynthesis light reactions process'"
      param :max_results, desc: "Number of results to return (1-10)", required: false

      def execute(query:, max_results: 5)
        api_key = Rails.application.credentials.dig(:tavily, :api_key)
        unless api_key.present?
          Rails.logger.warn("[WebSearch] No Tavily API key configured — returning empty results")
          return "[]"
        end

        max_results = max_results.to_i.clamp(1, 10)

        uri = URI("https://api.tavily.com/search")
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true
        http.read_timeout = 15
        http.open_timeout = 10

        request = Net::HTTP::Post.new(uri.path)
        request["Content-Type"] = "application/json"
        request.body = {
          api_key: api_key,
          query: query,
          search_depth: "basic",
          max_results: max_results,
          include_answer: false,
          include_raw_content: false
        }.to_json

        response = http.request(request)
        unless response.is_a?(Net::HTTPSuccess)
          Rails.logger.warn("[WebSearch] Tavily API error: #{response.code}")
          record_failed_interaction!
          return "[]"
        end

        data = JSON.parse(response.body)
        record_completed_interaction!(data.dig("usage", "credits"))
        results = (data["results"] || []).map do |r|
          { "title" => r["title"], "url" => r["url"], "snippet" => r["content"].to_s.truncate(300) }
        end

        halt results.to_json
      rescue Net::ReadTimeout, Net::OpenTimeout, JSON::ParserError, StandardError => e
        record_failed_interaction!
        Rails.logger.warn("[WebSearch] Search failed (#{e.class.name})")
        "[]"
      end

      private

      def record_completed_interaction!(reported_credits)
        credits = Integer(reported_credits, exception: false)
        rate, version = configured_rate_snapshot
        priced = credits && credits >= 0 && rate && version.present?

        AiOrchestrator::AiInteraction.create!(
          user: Thread.current[:lesson_agent_user], model: "tavily", task_type: "web_search",
          prompt: "tavily_search", response: "search_completed", status: :completed,
          provider_units: credits, provider_rate_microcents: rate,
          pricing_version: version, pricing_status: priced ? "priced" : "unpriced",
          cost_microcents: priced ? credits * rate : 0,
          cost_cents: priced ? AiOrchestrator::CostTracker.microcents_to_cents(credits * rate) : 0
        )
      rescue ActiveRecord::ActiveRecordError => e
        Rails.logger.warn("[WebSearch] Metering failed (#{e.class.name})")
        nil
      end

      def record_failed_interaction!
        AiOrchestrator::AiInteraction.create!(
          user: Thread.current[:lesson_agent_user], model: "tavily", task_type: "web_search",
          prompt: "tavily_search", status: :failed, pricing_status: "unpriced"
        )
      rescue ActiveRecord::ActiveRecordError
        nil
      end

      def configured_rate_snapshot
        credentials = Rails.application.credentials
        raw_rate = credentials.dig(:tavily, :usd_per_credit).presence || ENV["TAVILY_USD_PER_CREDIT"].presence
        version = credentials.dig(:tavily, :pricing_version).presence || ENV["TAVILY_PRICING_VERSION"].presence
        return [nil, version] unless raw_rate

        microcents = BigDecimal(raw_rate.to_s) * AiOrchestrator::CostTracker::MICROCENTS_PER_DOLLAR
        return [nil, version] unless microcents.positive? && microcents.frac.zero?

        [microcents.to_i, version]
      rescue ArgumentError
        [nil, version]
      end
    end
  end
end
