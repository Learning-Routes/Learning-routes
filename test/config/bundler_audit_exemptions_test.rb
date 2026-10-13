require "test_helper"

# An exemption in config/bundler-audit.yml is a claim that an advisory does not
# apply. These tests hold each claim to its reason, so an exemption cannot outlive it.
#
# ruby_llm 1.11.0: GHSA-5m38-526f-3498, GHSA-57hg-jgw4-wcqw and GHSA-42r3-x6vx-x49x
# (CVE-2026-67987/67989/67991, published 2026-10-10). All three are polynomial
# regexp backtracking "on Ruby 3.1.x". Ruby >= 3.2 memoizes regexp matching, which
# bounds it. The only listed fix is ruby_llm 2.x, a new major behind every paid AI
# call. Exempted by the owner's ruling on 12 October (CI-2).
class BundlerAuditExemptionsTest < ActiveSupport::TestCase
  RUBY_LLM_REDOS = %w[CVE-2026-67987 CVE-2026-67989 CVE-2026-67991].freeze
  MEMOIZED_REGEXP = Gem::Version.new("3.2")

  test "the ignore list is exactly the exemptions this file justifies" do
    ignored = YAML.load_file(Rails.root.join("config/bundler-audit.yml")).fetch("ignore")

    assert_equal RUBY_LLM_REDOS.sort, ignored.sort
  end

  test "the ruby_llm exemptions hold only on Ruby with memoized regexps" do
    dockerfile = Rails.root.join("Dockerfile").read[/^ARG RUBY_VERSION=(\S+)/, 1]

    { "running" => RUBY_VERSION, ".ruby-version" => Rails.root.join(".ruby-version").read.strip,
      "Dockerfile" => dockerfile }.each do |where, version|
      assert_operator Gem::Version.new(version), :>=, MEMOIZED_REGEXP,
        "#{where} Ruby is #{version}: the ruby_llm ReDoS advisories apply again; remove the exemption"
    end
  end

  test "the ruby_llm exemptions go once ruby_llm is on the fixed major" do
    locked = Bundler.locked_gems.specs.find { |spec| spec.name == "ruby_llm" }.version

    assert_operator locked, :<, Gem::Version.new("2.0.0.rc1"),
      "ruby_llm #{locked} carries the fix: delete the three exemptions and this test"
  end
end
