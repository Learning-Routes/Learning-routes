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
