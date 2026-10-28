require "test_helper"

# STEP 46 §2.6. Dependabot proposes platform updates only once a release is 14
# days old (security updates are never delayed: cooldown applies to version
# updates only), grouped weekly; osv-scanner checks the platform on every pull
# request and every week.
class PlatformSupplyChainTest < ActiveSupport::TestCase
  test "Dependabot waits 14 days and groups minor and patch updates weekly" do
    updates = YAML.load_file(Rails.root.join(".github/dependabot.yml")).fetch("updates")
    ecosystems = updates.to_h { [[_1["package-ecosystem"], _1["directory"]], _1] }

    assert_equal [["github-actions", "/"], ["npm", "/platform"]], ecosystems.keys.sort
    ecosystems.each_value do |update|
      assert_equal({ "default-days" => 14 }, update["cooldown"])
      assert_equal "weekly", update.dig("schedule", "interval")
      assert_includes update["groups"].values, { "update-types" => %w[minor patch] }
    end
  end

  test "osv-scanner runs on every pull request and every week" do
    workflow = YAML.load_file(Rails.root.join(".github/workflows/osv-scanner.yml"))
    triggers = workflow.fetch(true) # YAML reads the key `on` as true

    assert triggers.key?("pull_request")
    assert_match(/\A\S+ \S+ \* \* \d\z/, triggers.dig("schedule", 0, "cron"))
    workflow.fetch("jobs").each_value do |job|
      assert_match %r{\Agoogle/osv-scanner-action/.github/workflows/osv-scanner-reusable(-pr)?\.yml@[0-9a-f]{40}\z}, job["uses"]
    end
  end
end
