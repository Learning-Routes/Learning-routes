require "test_helper"

# STEP 38 §6, the owner's ruling: the automatic deploy stays off. Merges kept
# producing red deploy runs; the job is kept intact for the day he wants it
# back, but it runs only when someone starts it.
class DeployWorkflowTest < ActiveSupport::TestCase
  def workflow(name)
    yaml = YAML.load_file(Rails.root.join(".github/workflows/#{name}.yml"))
    yaml["on"] || yaml[true] # YAML 1.1 reads the bare key `on` as true
  end

  test "the deploy workflow runs only when started by hand" do
    assert_equal ["workflow_dispatch"], Array(workflow("deploy").keys)
  end

  test "a manual run is not skipped by a condition on the workflow_run event" do
    job = YAML.load_file(Rails.root.join(".github/workflows/deploy.yml")).dig("jobs", "deploy")

    assert job.present?, "the deploy job is kept"
    assert_no_match(/workflow_run/, job["if"].to_s)
  end

  test "CI still runs on push to main and on pull requests" do
    on = workflow("ci")

    assert_includes on.keys, "pull_request"
    assert_equal ["main"], on.dig("push", "branches")
  end
end
