require "test_helper"
require "rake"

# STEP 44 §1. The characterize tasks write the golden fixtures the new platform is
# ported against. This keeps them runnable while Rails is alive: every file has the
# agreed shape, carries no personal data, and a second run is byte-identical.
class CharacterizeTest < ActiveSupport::TestCase
  UUID = /\h{8}-\h{4}-\h{4}-\h{4}-\h{12}/
  EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/

  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("characterize:all")
    @out = Dir.mktmpdir("characterize")
  end

  teardown { FileUtils.rm_rf(@out) }

  test "block_registry records the whole vocabulary in one case" do
    output = run_unit("block_registry").fetch("cases").sole.fetch("output")

    assert_equal ContentEngine::LessonBlocks.types.sort, output.fetch("types")
    assert_equal %w[audio audio_explainer video], output.fetch("system_types")
    assert_equal "concept", output.fetch("heading_map").fetch("Concepto")
    assert_equal true, output.fetch("known").fetch("check")
    assert_equal false, output.fetch("known").fetch("tap_pairs")
    assert_equal %w[en es], output.fetch("default_titles").keys
  end

  test "block_grader grades and checks answerability, edge cases included" do
    cases = run_unit("block_grader").fetch("cases")

    normalized = cases.find do |c|
      c.dig("input", "section", "blanks") == ["Obrigado"] && c.dig("input", "payload", "answers") == [" obrigádo! "]
    end
    assert_equal({ "correct" => true, "gradable" => true, "reason" => nil, "score" => 100.0 },
                 normalized.dig("output", "call"))

    no_correct = cases.find { |c| c.dig("input", "section", "type") == "check" && c.dig("input", "section", "options") == [{ "label" => "A", "correct" => false }] }
    assert_equal false, no_correct.dig("output", "answerable")
    assert_equal "check has no option marked correct", no_correct.dig("output", "call", "reason")
  end

  test "gating covers every block type" do
    cases = run_unit("gating").fetch("cases").to_h { |c| [c["input"], c["output"]] }

    assert_equal ContentEngine::LessonBlocks.types.sort, (cases.keys & ContentEngine::LessonBlocks.types).sort
    assert_equal({ "engagement_only" => false, "gating" => true, "gradable" => true }, cases["check"])
    assert_equal({ "engagement_only" => true, "gating" => true, "gradable" => false }, cases["flashcards"])
    assert_equal({ "engagement_only" => true, "gating" => false, "gradable" => false }, cases["simulation"])
  end

  test "fsrs records review sequences, retrievability and intervals" do
    cases = run_unit("fsrs").fetch("cases").group_by { |c| c.dig("input", "kind") }

    assert_operator cases.fetch("review_sequence").size, :>=, 100
    first_good = cases["review_sequence"].find { |c| c.dig("input", "start").nil? && c.dig("input", "reviews", 0, "rating") == 3 }
    review = first_good.dig("output", 0)
    assert_equal [2.4, "fsrs_review", 2], review.values_at("fsrs_stability", "fsrs_state", "fsrs_scheduled_days")
    assert cases.fetch("retrievability").any?
    assert_equal 1, cases.fetch("next_interval").find { |c| c.dig("input", "stability") == 0 }["output"]
  end

  test "attempt_rating maps attempts to an FSRS rating, worst card and release included" do
    cases = run_unit("attempt_rating").fetch("cases").group_by { |c| c.dig("input", "kind") }

    worst = cases.fetch("fsrs_rating").find do |c|
      c["input"].values_at("block_type", "released", "payload") == ["flashcards", false, { "ratings" => %w[easy hard] }]
    end
    assert_equal 2, worst["output"]

    three_wrong = cases.fetch("submissions").find { |c| c.dig("input", "name") == "check: wrong three times" }
    assert_equal [false, false, true], three_wrong["output"].map { |s| s["released"] }
    assert_equal [nil], three_wrong["output"].last.values_at("fsrs_rating")
  end

  test "lesson_parser parses the markdown in the test suite" do
    cases = run_unit("lesson_parser").fetch("cases")

    variables = cases.find { |c| c["input"] == { "audio_url" => nil, "body" => ":::concept\nVariables\nThey store data.\n:::", "knowledge_checks" => nil } }
    assert_equal %w[concept summary], variables["output"].map { |s| s["type"] }
    assert_operator cases.size, :>=, 50
    assert(cases.all? { |c| c["output"].all? { |s| s.key?("type") } })
  end

  test "cost_estimate covers every priced model with at least five mixes" do
    cases = run_unit("cost_estimate").fetch("cases").group_by { |c| c.dig("input", "model") }

    AiOrchestrator::CostTracker::PRICING.each_key { |model| assert_operator cases.fetch(model).size, :>=, 5, model }
    million = cases["claude-sonnet-4-5"].find { |c| c["input"].except("model") == { "input_tokens" => 1_000_000 } }
    assert_equal 3_000_000, million["output"]
    assert_equal "ArgumentError", cases["tavily"].first.dig("output", "error")
  end

  test "spend_limits records thirty situations around each limit" do
    cases = run_unit("spend_limits").fetch("cases").group_by { |c| c.dig("input", "limit") }

    %w[daily_budget user_budget rate_limit].each { |limit| assert_operator cases.fetch(limit).size, :>=, 30, limit }
    at_cap = cases["daily_budget"].find { |c| c.dig("input", "delta_microcents") == 0 && c.dig("input", "noise") == "none" }
    assert_equal({ "allowed" => false, "kind" => "daily_budget" }, at_cap["output"].slice("allowed", "kind"))
    eleven = cases["rate_limit"].find { |c| c.dig("input", "model") == "elevenlabs" && c.dig("input", "calls") == 21 && c.dig("input", "pause_seconds").nil? }
    assert_equal 21, eleven.dig("output", "first_refused_call")
  end

  test "all writes every unit, byte-identical on a second run" do
    second = Dir.mktmpdir("characterize-again")
    [@out, second].each do |out|
      Rake::Task.tasks.select { |t| t.name.start_with?("characterize:") }.each(&:reenable)
      with_out(out) { Rake::Task["characterize:all"].invoke }
    end

    units = Characterization::UNITS.keys.map { |unit| "#{unit}.json" }
    assert_equal units.sort, Dir.children(@out).sort
    units.each { |file| assert_equal File.read(File.join(@out, file)), File.read(File.join(second, file)), file }
  ensure
    FileUtils.rm_rf(second)
  end

  private

  def run_unit(unit, out: @out)
    task = Rake::Task["characterize:#{unit}"]
    task.reenable
    with_out(out) { task.invoke }
    read_fixture(unit, out)
  end

  def with_out(out)
    previous = ENV["OUT"]
    ENV["OUT"] = out
    yield
  ensure
    ENV["OUT"] = previous
  end

  # The shape every fixture shares (STEP 44 §1), and the personal-data guard.
  def read_fixture(unit, out)
    raw = File.read(File.join(out, "#{unit}.json"))
    assert_no_match UUID, raw, "#{unit}.json carries an id"
    assert_no_match EMAIL, raw, "#{unit}.json carries an email"

    fixture = JSON.parse(raw)
    assert_equal %w[captured_at cases source unit], fixture.keys.sort
    assert_equal unit, fixture["unit"]
    path, line = fixture["source"].split(":")
    assert File.exist?(Rails.root.join(path)), "#{unit}: #{path} does not exist"
    assert_operator line.to_i, :>, 0
    assert_equal "2026-10-26T12:00:00Z", fixture["captured_at"]
    assert fixture["cases"].any?, "#{unit}.json has no cases"
    fixture["cases"].each { |c| assert_equal %w[input output], c.keys.sort }
    fixture
  end
end
