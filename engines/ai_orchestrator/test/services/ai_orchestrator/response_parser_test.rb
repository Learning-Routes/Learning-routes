require "test_helper"

module AiOrchestrator
  class ResponseParserTest < ActiveSupport::TestCase
    test "parses valid JSON" do
      parser = ResponseParser.new('{"key": "value"}', expected_format: :json)
      result = parser.parse
      assert_equal({ "key" => "value" }, result)
    end

    test "parses JSON from markdown code block" do
      response = "Here is the result:\n```json\n{\"key\": \"value\"}\n```"
      parser = ResponseParser.new(response, expected_format: :json)
      result = parser.parse
      assert_equal({ "key" => "value" }, result)
    end

    test "returns error for invalid JSON" do
      parser = ResponseParser.new("not json", expected_format: :json)
      result = parser.parse
      assert result[:error].present?
    end

    test "parses text format" do
      parser = ResponseParser.new("  hello world  ", expected_format: :text)
      assert_equal "hello world", parser.parse
    end
  end
end
