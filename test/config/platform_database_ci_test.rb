require "test_helper"

# Platform STEP 2 §1.2: CI tests the platform against the same Postgres image and
# role script as platform/docker-compose.yml, so local and CI never disagree.
class PlatformDatabaseCiTest < ActiveSupport::TestCase
  test "the platform job runs compose's Postgres image and its role script" do
    compose = YAML.load_file(Rails.root.join("platform/docker-compose.yml"))
    job = YAML.load_file(Rails.root.join(".github/workflows/platform.yml")).dig("jobs", "platform")

    assert_equal compose.dig("services", "postgres", "image"), job.dig("services", "postgres", "image")
    steps = job.fetch("steps").map { _1["run"].to_s }
    assert steps.any? { _1.include?("db/init/01-roles.sql") }, "no step runs db/init/01-roles.sql"
  end
end
