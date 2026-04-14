# frozen_string_literal: true

require "test_helper"

class ContentEngine::Tools::WebSearchTest < ActiveSupport::TestCase
  setup do
    @tool = ContentEngine::Tools::WebSearch.new
    @original_tavily_key = ENV["TAVILY_API_KEY"]
  end

  teardown do
    ENV["TAVILY_API_KEY"] = @original_tavily_key
    restore_http_new!
  end

  test "returns results array with title, url, and snippet keys" do
    mock_response_body = {
      "results" => [
        { "title" => "Photosynthesis", "url" => "https://example.com/photo", "content" => "Plants convert sunlight..." },
        { "title" => "Light Reactions", "url" => "https://example.com/light", "content" => "The light-dependent..." }
      ]
    }.to_json

    stub_http_with(MockHTTP.new(build_success_response(mock_response_body)))
    ENV["TAVILY_API_KEY"] = "tvly-test-key"

    result = execute_tool(query: "photosynthesis process")
    parsed = JSON.parse(result)

    assert_kind_of Array, parsed
    assert_equal 2, parsed.length
    assert_equal "Photosynthesis", parsed.first["title"]
    assert_equal "https://example.com/photo", parsed.first["url"]
    assert_includes parsed.first["snippet"], "Plants convert"
  end

  test "returns empty array when API key is missing" do
    ENV["TAVILY_API_KEY"] = nil

    result = execute_tool(query: "anything")
    assert_equal "[]", result
  end

  test "returns empty array on network error" do
    stub_http_with(MockHTTP.new(nil, error: Net::ReadTimeout))
    ENV["TAVILY_API_KEY"] = "tvly-test-key"

    result = execute_tool(query: "anything")
    assert_equal "[]", result
  end

  test "clamps max_results between 1 and 10" do
    capturing_http = MockHTTP.new(build_success_response({ "results" => [] }.to_json), capture_body: true)
    stub_http_with(capturing_http)
    ENV["TAVILY_API_KEY"] = "tvly-test-key"

    execute_tool(query: "test", max_results: 0)
    body = JSON.parse(capturing_http.last_request_body)
    assert_equal 1, body["max_results"]

    execute_tool(query: "test", max_results: 99)
    body = JSON.parse(capturing_http.last_request_body)
    assert_equal 10, body["max_results"]
  end

  test "truncates snippet to 300 characters" do
    long_content = "A" * 500
    mock_response_body = {
      "results" => [
        { "title" => "Long", "url" => "https://example.com", "content" => long_content }
      ]
    }.to_json

    stub_http_with(MockHTTP.new(build_success_response(mock_response_body)))
    ENV["TAVILY_API_KEY"] = "tvly-test-key"

    result = execute_tool(query: "test")
    parsed = JSON.parse(result)

    assert parsed.first["snippet"].length <= 300
  end

  private

  # Execute the tool, unwrapping Halt objects (halt returns a Halt wrapper, not raises)
  def execute_tool(**kwargs)
    result = @tool.execute(**kwargs)
    result.is_a?(RubyLLM::Tool::Halt) ? result.content : result
  end

  def build_success_response(body)
    resp = Net::HTTPSuccess.allocate
    resp.instance_variable_set(:@body, body)
    resp.instance_variable_set(:@read, true)
    resp
  end

  def stub_http_with(mock_http)
    unless Net::HTTP.singleton_class.method_defined?(:_original_new_for_test)
      Net::HTTP.singleton_class.alias_method :_original_new_for_test, :new
    end
    Net::HTTP.define_singleton_method(:new) { |*_args| mock_http }
  end

  def restore_http_new!
    if Net::HTTP.singleton_class.method_defined?(:_original_new_for_test)
      Net::HTTP.singleton_class.alias_method :new, :_original_new_for_test
      Net::HTTP.singleton_class.remove_method :_original_new_for_test
    end
  end

  class MockHTTP
    attr_reader :last_request_body

    def initialize(response, error: nil, capture_body: false)
      @response = response
      @error = error
      @capture_body = capture_body
    end

    def use_ssl=(_val); end
    def read_timeout=(_val); end
    def open_timeout=(_val); end

    def request(req)
      raise @error if @error

      @last_request_body = req.body if @capture_body
      @response
    end
  end
end
