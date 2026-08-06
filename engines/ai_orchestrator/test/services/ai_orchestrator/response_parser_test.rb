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

    test "parses JSON from unmarked code block" do
      response = "Result:\n```\n{\"key\": \"value\"}\n```"
      parser = ResponseParser.new(response, expected_format: :json)
      result = parser.parse
      assert_equal({ "key" => "value" }, result)
    end

    test "extracts JSON object from mixed text" do
      response = "Some text before {\"key\": \"value\"} some text after"
      parser = ResponseParser.new(response, expected_format: :json)
      result = parser.parse
      assert_equal({ "key" => "value" }, result)
    end

    test "wraps JSON array in data key" do
      parser = ResponseParser.new('[1, 2, 3]', expected_format: :json)
      result = parser.parse
      assert_equal({ "data" => [1, 2, 3] }, result)
    end

    test "returns error for invalid JSON" do
      parser = ResponseParser.new("not json at all", expected_format: :json)
      result = parser.parse
      assert result[:error].present?
      assert result[:raw].present?
    end

    test "parse! raises for invalid JSON" do
      parser = ResponseParser.new("not json", expected_format: :json)
      assert_raises(ResponseParser::ParseError) { parser.parse! }
    end

    test "parses text format" do
      parser = ResponseParser.new("  hello world  ", expected_format: :text)
      assert_equal "hello world", parser.parse
    end

    test "parses markdown format" do
      parser = ResponseParser.new("# Title\n\nContent", expected_format: :markdown)
      assert_equal "# Title\n\nContent", parser.parse
    end

    test "strips markdown code fence wrapper" do
      response = "```markdown\n# Title\n\nContent\n```"
      parser = ResponseParser.new(response, expected_format: :markdown)
      assert_equal "# Title\n\nContent", parser.parse
    end

    test "binary format returns raw response" do
      data = "binary data"
      parser = ResponseParser.new(data, expected_format: :binary)
      assert_equal data, parser.parse
    end

    test "validates schema for assessment_questions" do
      valid_response = {
        "questions" => [
          {
            "question" => "What is Ruby?",
            "options" => ["A", "B", "C", "D"],
            "correct_answer" => "A",
            "explanation" => "Ruby is..."
          }
        ]
      }.to_json

      parser = ResponseParser.new(valid_response, expected_format: :json, task_type: :assessment_questions)
      result = parser.parse
      assert_not result.key?("_validation_warnings")
    end

    test "adds warnings for missing required keys" do
      invalid_response = { "something" => "else" }.to_json
      parser = ResponseParser.new(invalid_response, expected_format: :json, task_type: :assessment_questions)
      result = parser.parse
      assert result.key?("_validation_warnings")
      assert_match(/questions/, result["_validation_warnings"])
    end

    test "validates schema for quick_grading" do
      valid_response = {
        "score" => 85,
        "feedback" => "Good work"
      }.to_json

      parser = ResponseParser.new(valid_response, expected_format: :json, task_type: :quick_grading)
      result = parser.parse
      assert_not result.key?("_validation_warnings")
    end

    test "schema validation only applies to json format" do
      parser = ResponseParser.new("plain text", expected_format: :text, task_type: :assessment_questions)
      result = parser.parse
      assert_equal "plain text", result
    end

    test "unknown task types skip schema validation" do
      parser = ResponseParser.new('{"key": "value"}', expected_format: :json, task_type: :unknown_type)
      result = parser.parse
      assert_equal({ "key" => "value" }, result)
    end

    # --- Extraction regressions (AUDIT.md §P1-4) ---
    #
    # Each of these was reproduced as a real failure before the fix. The third is
    # the damaging one: a lesson body containing a fenced code block, which is most
    # of them.

    NESTED_QUIZ = {
      "questions" => [
        { "question" => "Q1", "options" => %w[a b], "correct_answer" => 0,
          "explanation" => "because {x}" }
      ]
    }.freeze

    test "greedy matching does not swallow prose that follows the JSON" do
      raw = "#{NESTED_QUIZ.to_json}\nNote: use {curly} braces carefully."

      result = ResponseParser.new(raw, expected_format: :json, task_type: :step_quiz).parse

      assert_not result.key?(:error), "trailing prose containing a brace broke the parse"
      assert_equal 1, result["questions"].size
    end

    test "a fence inside a JSON string value is not mistaken for the wrapper" do
      raw = { "title" => "T", "content" => "```ruby\nputs 1\n```" }.to_json

      result = ResponseParser.new(raw, expected_format: :json, task_type: :lesson_content).parse

      assert_not result.key?(:error), "an inner code fence was treated as the response wrapper"
      assert_equal "```ruby\nputs 1\n```", result["content"]
    end

    test "a fenced response whose body contains its own fence still parses" do
      inner = { "title" => "T", "content" => "see:\n```ruby\nputs 1\n```\ndone" }.to_json
      raw = "```json\n#{inner}\n```"

      result = ResponseParser.new(raw, expected_format: :json, task_type: :lesson_content).parse

      assert_not result.key?(:error)
      assert_includes result["content"], "puts 1"
    end

    test "braces inside string values do not unbalance the scan" do
      raw = '{"a":[{"b":"}"},{"c":"{"}],"d":1}'

      result = ResponseParser.new(raw, expected_format: :json).parse

      assert_equal 1, result["d"]
      assert_equal 2, result["a"].size
    end

    test "prose before the JSON is still stripped" do
      raw = "Here is your quiz:\n#{NESTED_QUIZ.to_json}"

      result = ResponseParser.new(raw, expected_format: :json, task_type: :step_quiz).parse

      assert_equal 1, result["questions"].size
    end
  end
end
