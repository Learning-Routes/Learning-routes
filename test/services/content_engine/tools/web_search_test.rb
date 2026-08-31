# frozen_string_literal: true

require "test_helper"

class ContentEngine::Tools::WebSearchTest < ActiveSupport::TestCase
  setup do
    @tool = ContentEngine::Tools::WebSearch.new
    # The tool reads the Tavily key from Rails credentials (no ENV fallback);
    # tests inject it via @tavily_key, stubbed in execute_tool.
    @tavily_key = nil
    @tavily_rate = nil
    @tavily_pricing_version = nil
  end

  teardown do
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
    @tavily_key = "tvly-test-key"

    result = execute_tool(query: "photosynthesis process")
    parsed = JSON.parse(result)

    assert_kind_of Array, parsed
    assert_equal 2, parsed.length
    assert_equal "Photosynthesis", parsed.first["title"]
    assert_equal "https://example.com/photo", parsed.first["url"]
    assert_includes parsed.first["snippet"], "Plants convert"
  end

  test "returns empty array when API key is missing" do
    @tavily_key = nil

    result = execute_tool(query: "anything")
    assert_equal "[]", result
  end

  test "returns empty array on network error" do
    stub_http_with(MockHTTP.new(nil, error: Net::ReadTimeout))
    @tavily_key = "tvly-test-key"

    result = execute_tool(query: "anything")
    assert_equal "[]", result
  end

  test "clamps max_results between 1 and 10" do
    capturing_http = MockHTTP.new(build_success_response({ "results" => [] }.to_json), capture_body: true)
    stub_http_with(capturing_http)
    @tavily_key = "tvly-test-key"

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
    @tavily_key = "tvly-test-key"

    result = execute_tool(query: "test")
    parsed = JSON.parse(result)

    assert parsed.first["snippet"].length <= 300
  end

  test "persists one provider-reported credit at the configured exact rate" do
    stub_success(credits: 1)
    configure_tavily(rate: "0.008", version: "payg-2026-08-31")

    execute_tool(query: "current fact")

    interaction = AiOrchestrator::AiInteraction.find_by!(model: "tavily")
    assert_equal 1, interaction.provider_units
    assert_equal 8_000, interaction.provider_rate_microcents
    assert_equal 8_000, interaction.cost_microcents
    assert_equal "payg-2026-08-31", interaction.pricing_version
    assert_equal "priced", interaction.pricing_status
  end

  test "provider-reported multi-credit usage is authoritative" do
    stub_success(credits: 3)
    configure_tavily(rate: "0.0067", version: "project-2026-08-31")

    execute_tool(query: "current fact", max_results: 1)

    interaction = AiOrchestrator::AiInteraction.find_by!(model: "tavily")
    assert_equal 3, interaction.provider_units
    assert_equal 20_100, interaction.cost_microcents
  end

  test "missing rate preserves credits as explicitly unpriced" do
    stub_success(credits: 2)
    configure_tavily(rate: nil, version: nil)

    execute_tool(query: "current fact")

    interaction = AiOrchestrator::AiInteraction.find_by!(model: "tavily")
    assert_equal 2, interaction.provider_units
    assert_equal "unpriced", interaction.pricing_status
    assert_equal 0, interaction.cost_microcents
    assert_not_includes AiOrchestrator::AiInteraction.billable, interaction
  end

  test "failed and cached Tavily interactions are non-billable" do
    stub_http_with(MockHTTP.new(build_error_response))
    configure_tavily(rate: "0.008", version: "payg-2026-08-31")
    execute_tool(query: "current fact")

    failed = AiOrchestrator::AiInteraction.find_by!(model: "tavily")
    assert failed.failed?

    cached = AiOrchestrator::AiInteraction.create!(
      model: "tavily", prompt: "tavily_search", task_type: "web_search",
      status: :completed, cached: true, pricing_status: "priced",
      provider_units: 1, provider_rate_microcents: 8_000, cost_microcents: 8_000
    )
    assert_not_includes AiOrchestrator::AiInteraction.billable, failed
    assert_not_includes AiOrchestrator::AiInteraction.billable, cached
  end

  test "rate snapshots remain immutable after configuration changes" do
    stub_success(credits: 1)
    configure_tavily(rate: "0.008", version: "rate-a")
    execute_tool(query: "first fact")
    first = AiOrchestrator::AiInteraction.find_by!(model: "tavily")

    configure_tavily(rate: "0.005", version: "rate-b")
    execute_tool(query: "second fact")

    assert_equal 8_000, first.reload.provider_rate_microcents
    assert_equal "rate-a", first.pricing_version
    assert_equal [5_000, 8_000], AiOrchestrator::AiInteraction.where(model: "tavily")
      .order(:provider_rate_microcents).pluck(:cost_microcents)
  end

  test "aggregates configured decimal rates using integer microcents" do
    stub_success(credits: 3)
    configure_tavily(rate: "0.0075", version: "exact-rate")
    execute_tool(query: "current fact")

    assert_equal 22_500, AiOrchestrator::CostTracker.daily_cost_microcents
    assert_kind_of Integer, AiOrchestrator::AiInteraction.find_by!(model: "tavily").cost_microcents
  end

  private

  # Execute the tool, unwrapping Halt objects (halt returns a Halt wrapper, not
  # raises). Stubs the Tavily credential lookup to the test's @tavily_key.
  def execute_tool(**kwargs)
    creds = Rails.application.credentials
    key = @tavily_key
    original = creds.method(:dig)
    rate = @tavily_rate
    version = @tavily_pricing_version
    creds.define_singleton_method(:dig) do |*keys|
      case keys
      when [:tavily, :api_key] then key
      when [:tavily, :usd_per_credit] then rate
      when [:tavily, :pricing_version] then version
      else original.call(*keys)
      end
    end
    begin
      result = @tool.execute(**kwargs)
      result.is_a?(RubyLLM::Tool::Halt) ? result.content : result
    ensure
      creds.singleton_class.send(:remove_method, :dig)
    end
  end

  def configure_tavily(rate:, version:)
    @tavily_key = "tvly-test-key"
    @tavily_rate = rate
    @tavily_pricing_version = version
  end

  def stub_success(credits:)
    body = { "results" => [], "usage" => { "credits" => credits } }.to_json
    stub_http_with(MockHTTP.new(build_success_response(body)))
  end

  def build_error_response
    response = Net::HTTPBadRequest.allocate
    response.instance_variable_set(:@body, "provider error")
    response.instance_variable_set(:@read, true)
    response
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
