module AiOrchestrator
  class ResponseParser
    def initialize(response, expected_format: :json)
      @response = response
      @expected_format = expected_format
    end

    def parse
      case @expected_format
      when :json then parse_json
      when :text then parse_text
      when :markdown then parse_markdown
      else parse_text
      end
    end

    private

    def parse_json
      # Try to extract JSON from response (handles markdown code blocks)
      json_str = @response.to_s
      json_str = json_str.match(/```(?:json)?\s*(.+?)```/m)&.captures&.first || json_str
      JSON.parse(json_str)
    rescue JSON::ParserError => e
      { error: "Failed to parse JSON response", raw: @response, message: e.message }
    end

    def parse_text
      @response.to_s.strip
    end

    def parse_markdown
      @response.to_s.strip
    end
  end
end
