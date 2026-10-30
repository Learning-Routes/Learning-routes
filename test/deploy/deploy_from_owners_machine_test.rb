require "test_helper"
require "open3"

# The owner's ruling: the Rails app is deployed only from the owner's Mac with
# `kamal deploy`. No workflow deploys it and GitHub holds none of its secrets;
# .kamal/secrets reads every value from the environment and is never committed.
class DeployFromOwnersMachineTest < ActiveSupport::TestCase
  WORKFLOWS = Rails.root.join(".github/workflows")
  DEPLOY_SECRETS = %w[KAMAL_REGISTRY_USERNAME KAMAL_REGISTRY_PASSWORD RAILS_MASTER_KEY
                      POSTGRES_PASSWORD LEARNING_ROUTES_DATABASE_PASSWORD SSH_PRIVATE_KEY].freeze

  def git(*args)
    _out, status = Open3.capture2e("git", *args, chdir: Rails.root.to_s)
    status.success?
  end

  test "no workflow deploys the Rails app or reads a deploy secret" do
    assert_not WORKFLOWS.join("deploy.yml").exist?

    Dir[WORKFLOWS.join("*.{yml,yaml}")].each do |path|
      text = File.read(path)
      assert_no_match(/kamal/i, text, "#{File.basename(path)} runs kamal")
      DEPLOY_SECRETS.each { |name| assert_not_includes text, "secrets.#{name}", "#{File.basename(path)} reads #{name}" }
    end
  end

  test ".kamal/secrets is ignored and not tracked" do
    assert git("check-ignore", "-q", "--no-index", ".kamal/secrets"), ".kamal/secrets is not ignored"
    assert_not git("ls-files", "--error-unmatch", ".kamal/secrets"), ".kamal/secrets is still tracked"
  end

  test "the example names each secret and reads it from the environment" do
    lines = Rails.root.join(".kamal/secrets.example").read.lines(chomp: true)
    entries = lines.reject { |line| line.blank? || line.start_with?("#") }

    entries.each { |line| assert_match(/\A([A-Z_]+)=\$\{\1\}\z/, line, "a value that is not an environment reference") }
    names = entries.map { |line| line.split("=").first }
    assert_equal %w[KAMAL_REGISTRY_USERNAME KAMAL_REGISTRY_PASSWORD RAILS_MASTER_KEY POSTGRES_PASSWORD], names
  end

  test "CI still runs on push to main and on pull requests" do
    yaml = YAML.load_file(WORKFLOWS.join("ci.yml"))
    on = yaml["on"] || yaml[true] # YAML 1.1 reads the bare key `on` as true

    assert_includes on.keys, "pull_request"
    assert_equal ["main"], on.dig("push", "branches")
  end
end
