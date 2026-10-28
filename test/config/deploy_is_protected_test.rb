require "test_helper"

# Platform STEP 1 §2.7. The deploy job holds the keys to production, so it runs
# only from main and only through the protected production environment, whose
# required reviewer is the owner.
class DeployIsProtectedTest < ActiveSupport::TestCase
  test "the deploy job runs only from main, in the production environment" do
    jobs = YAML.load_file(Rails.root.join(".github/workflows/deploy.yml")).fetch("jobs")

    jobs.each do |name, job|
      assert_equal "production", job["environment"], "#{name} runs outside the production environment"
      assert_equal "github.ref == 'refs/heads/main'", job["if"], "#{name} can run from a branch other than main"
    end
  end
end
