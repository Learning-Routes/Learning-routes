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
