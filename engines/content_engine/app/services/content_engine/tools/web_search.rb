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
        api_key = ENV["TAVILY_API_KEY"] || Rails.application.credentials.dig(:tavily, :api_key)
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
          return "[]"
        end

        data = JSON.parse(response.body)
        results = (data["results"] || []).map do |r|
          { "title" => r["title"], "url" => r["url"], "snippet" => r["content"].to_s.truncate(300) }
        end

        halt results.to_json
      rescue Net::ReadTimeout, Net::OpenTimeout, JSON::ParserError, StandardError => e
        Rails.logger.warn("[WebSearch] Search failed: #{e.message}")
        "[]"
      end
    end
  end
end
