require "test_helper"

# An exemption in config/bundler-audit.yml is a claim that an advisory does not
# apply. Each one gets a test here that fails when its reason stops being true,
# so an exemption cannot outlive it. The three ruby_llm ReDoS exemptions went
# with ruby_llm 2.1.1, which carries the fix.
class BundlerAuditExemptionsTest < ActiveSupport::TestCase
  test "the ignore list is exactly the exemptions this file justifies" do
    ignored = YAML.load_file(Rails.root.join("config/bundler-audit.yml")).fetch("ignore")

    assert_empty ignored
  end
end
