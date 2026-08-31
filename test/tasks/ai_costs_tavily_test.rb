require "test_helper"
require "rake"

class AiCostsTavilyTest < ActiveSupport::TestCase
  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("ai_costs:report")
    @interaction = AiOrchestrator::AiInteraction.create!(
      model: "tavily", task_type: "web_search", prompt: "tavily_search",
      status: :completed, provider_units: 2, pricing_status: "unpriced"
    )
    @original_apply = ENV["APPLY"]
  end

  teardown do
    ENV["APPLY"] = @original_apply
  end

  test "dry run leaves recoverable text and TTS rows unchanged" do
    text = legacy_row(model: "gpt-4.1-mini", input_tokens: 1_000)
    tts = legacy_row(model: "elevenlabs", input_tokens: 100)

    ENV.delete("APPLY")
    capture_io { invoke_task("ai_costs:backfill") }

    assert_equal ["unpriced", 0], [text.reload.pricing_status, text.cost_microcents]
    assert_equal ["unpriced", 0], [tts.reload.pricing_status, tts.cost_microcents]
  end

  test "explicit apply prices recoverable rows idempotently and excludes cached or failed" do
    text = legacy_row(model: "gpt-4.1-mini", input_tokens: 1_000)
    cached = legacy_row(model: "gpt-4.1-mini", input_tokens: 1_000, cached: true)
    failed = legacy_row(model: "gpt-4.1-mini", input_tokens: 1_000, status: :failed)
    ENV["APPLY"] = "1"

    capture_io { invoke_task("ai_costs:backfill") }
    first = text.reload.cost_microcents
    capture_io { invoke_task("ai_costs:backfill") }

    assert_equal 400, first
    assert_equal ["priced", 400], [text.reload.pricing_status, text.cost_microcents]
    assert_equal "unpriced", cached.reload.pricing_status
    assert_equal "unpriced", failed.reload.pricing_status
  end

  test "image and transcription history without usage remain unknown" do
    image = legacy_row(model: "gpt-image-1", input_tokens: 100)
    stt = legacy_row(model: "scribe_v2")
    ENV["APPLY"] = "1"

    output = capture_io { invoke_task("ai_costs:backfill") }.first

    assert_equal "unpriced", image.reload.pricing_status
    assert_equal "unpriced", stt.reload.pricing_status
    assert_match(/gpt-image-1.*unknown/i, output)
    assert_match(/scribe_v2.*unknown/i, output)
  end

  test "report displays unpriced Tavily credits as unknown" do
    output = capture_io { invoke_task("ai_costs:report") }.first

    assert_match(/tavily.*2 credits.*unknown/i, output)
  end

  test "backfill refuses to invent a historical Tavily rate" do
    output = capture_io { invoke_task("ai_costs:backfill") }.first

    assert_match(/tavily.*2 credits.*unknown/i, output)
    assert_equal "unpriced", @interaction.reload.pricing_status
    assert_equal 0, @interaction.cost_microcents
  end

  private

  def invoke_task(name)
    task = Rake::Task[name]
    task.reenable
    task.invoke
  end

  def legacy_row(model:, input_tokens: 0, output_tokens: 0, cached: false, status: :completed)
    AiOrchestrator::AiInteraction.create!(
      model: model, prompt: "legacy_usage", status: status, cached: cached,
      input_tokens: input_tokens, output_tokens: output_tokens, pricing_status: "unpriced"
    )
  end
end
