require "test_helper"
require "open3"

# STEP 46 §1. CI runs the Rails jobs and the platform job only for the part of the
# repository a change touches. The jobs are skipped rather than left out of the run,
# because a required check that never reports blocks the pull request.
class CiChangedPartsTest < ActiveSupport::TestCase
  SCRIPT = Rails.root.join(".github/scripts/changed-parts.sh").to_s

  def parts(*paths)
    out, status = Open3.capture2(SCRIPT, stdin_data: paths.map { "#{_1}\n" }.join)
    assert status.success?, "changed-parts.sh exited with #{status.exitstatus}"
    out.lines(chomp: true).to_h { _1.split("=", 2) }
  end

  test "a change inside platform/ runs only the platform" do
    assert_equal({ "rails" => "false", "platform" => "true" }, parts("platform/packages/core/src/index.ts"))
  end

  test "a Rails change runs only Rails" do
    assert_equal({ "rails" => "true", "platform" => "false" }, parts("app/models/user.rb", "Gemfile.lock"))
  end

  test "a change on both sides runs both" do
    assert_equal({ "rails" => "true", "platform" => "true" }, parts("platform/README.md", "README.md"))
  end

  test "the platform workflow is the platform's" do
    assert_equal({ "rails" => "false", "platform" => "true" }, parts(".github/workflows/platform.yml"))
  end

  test "the script itself runs both" do
    assert_equal({ "rails" => "true", "platform" => "true" }, parts(".github/scripts/changed-parts.sh"))
  end

  test "an unknown change (no file list) runs both" do
    assert_equal({ "rails" => "true", "platform" => "true" }, parts)
  end

  def part(workflow) = workflow == "ci.yml" ? "rails" : "platform"

  test "both workflows ask the script before running" do
    %w[ci.yml platform.yml].each do |name|
      workflow = YAML.load_file(Rails.root.join(".github/workflows", name))
      gated = workflow.fetch("jobs").except("changes")

      assert_not_empty gated, "#{name} has no jobs besides changes"
      gated.each do |job, spec|
        assert_equal "changes", spec["needs"], "#{name}: #{job} must need the changes job"
        # Runs unless the script said false: if the changes job fails, the checks
        # run instead of being skipped, which branch protection would count as passed.
        assert_equal "${{ !cancelled() && needs.changes.outputs.#{part(name)} != 'false' }}", spec["if"],
          "#{name}: #{job} must be skipped only when its part did not change"
      end
    end
  end
end
