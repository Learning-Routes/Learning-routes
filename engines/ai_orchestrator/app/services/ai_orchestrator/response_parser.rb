module AiOrchestrator
  class ResponseParser
    class ParseError < StandardError; end

    SCHEMAS = {
      "assessment_questions" => {
        required_keys: %w[questions],
        questions_keys: %w[question options correct_answer explanation]
      },
      "route_generation" => {
        required_keys: %w[route_name modules],
        modules_keys: %w[name description lessons]
      },
      "lesson_content" => {
        required_keys: %w[title content],
        optional_keys: %w[summary key_points exercises]
      },
      "code_generation" => {
        required_keys: %w[code language],
        optional_keys: %w[explanation test_cases]
      },
      "exam_questions" => {
        required_keys: %w[questions],
        questions_keys: %w[question type options correct_answer points]
      },
      "quick_grading" => {
        required_keys: %w[score feedback],
        optional_keys: %w[suggestions correct_answer]
      },
      "gap_analysis" => {
        required_keys: %w[gaps],
        gaps_keys: %w[topic severity description]
      },
      "reinforcement_generation" => {
        required_keys: %w[steps],
        steps_keys: %w[title description content_type estimated_minutes]
      }
    }.freeze

    def initialize(response, expected_format: :json, task_type: nil)
      @response = response
      @expected_format = expected_format.to_sym
      @task_type = task_type&.to_s
    end

    def parse
      result = case @expected_format
               when :json then parse_json
               when :text then parse_text
               when :markdown then parse_markdown
               when :binary then parse_binary
               else parse_text
               end

      validate_schema!(result) if @task_type && @expected_format == :json && result.is_a?(Hash)
      result
    end

    def parse!
      result = parse
      if result.is_a?(Hash) && result[:error]
        raise ParseError, result[:error]
      end
      result
    end

    private

    def parse_json
      json_str = extract_json_string
      parsed = JSON.parse(json_str)
      parsed.is_a?(Hash) ? parsed : { "data" => parsed }
    rescue JSON::ParserError => e
      { error: "Failed to parse JSON response", raw: @response.to_s.truncate(500), message: e.message }
    end

    def extract_json_string
      text = @response.to_s.strip

      # Try extracting from markdown code blocks
      if (match = text.match(/```(?:json)?\s*\n?(.+?)\n?\s*```/m))
        return match.captures.first.strip
      end

      # Try extracting JSON object or array directly
      if (match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/))
        return match.captures.first.strip
      end

      text
    end

    def parse_text
      @response.to_s.strip
    end

    def parse_markdown
      text = @response.to_s.strip
      # Remove leading/trailing code fences if the entire response is wrapped
      text = text.sub(/\A```(?:markdown)?\s*\n?/, "").sub(/\n?\s*```\z/, "")
      text.strip
    end

    def parse_binary
      @response
    end

    def validate_schema!(result)
      schema = SCHEMAS[@task_type]
      return unless schema

      missing = schema[:required_keys].reject { |key| result.key?(key) }
      if missing.any?
        Rails.logger.warn(
          "[AiOrchestrator::ResponseParser] Missing required keys for #{@task_type}: #{missing.join(', ')}"
        )
        result["_validation_warnings"] = "Missing required keys: #{missing.join(', ')}"
      end

      # Validate nested array structures
      validate_nested_items!(result, schema)
    end

    def validate_nested_items!(result, schema)
      schema.each do |key, expected_keys|
        key = key.to_s
        next unless key.end_with?("_keys")
        array_key = key.sub("_keys", "")
        items = result[array_key]
        next unless items.is_a?(Array) && items.any?

        items.each_with_index do |item, idx|
          next unless item.is_a?(Hash)
          missing = expected_keys.reject { |k| item.key?(k) }
          if missing.any?
            Rails.logger.warn(
              "[AiOrchestrator::ResponseParser] #{array_key}[#{idx}] missing keys: #{missing.join(', ')}"
            )
          end
        end
      end
    end
  end
end
