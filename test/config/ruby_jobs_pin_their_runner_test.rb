require "test_helper"

# ubuntu-latest moved to 26.04 before setup-ruby had a Ruby 3.3.8 build for it, and
# every job on it failed at "Unavailable version 3.3.8 for ruby on ubuntu-26.04".
# A job that installs Ruby names the Ubuntu release it was built for.
class RubyJobsPinTheirRunnerTest < ActiveSupport::TestCase
  test "every job that sets up Ruby pins its runner" do
    Rails.root.glob(".github/workflows/*.yml").each do |file|
      YAML.load_file(file).fetch("jobs").each do |name, job|
        next unless Array(job["steps"]).any? { _1["uses"].to_s.start_with?("ruby/setup-ruby") }

        assert_match(/\Aubuntu-\d+\.\d+\z/, job["runs-on"], "#{file.basename}: #{name} runs on #{job["runs-on"]}")
      end
    end
  end
end
