require "test_helper"
require "open3"
require "tmpdir"

# STEP 35 §3b. On 12 September 9c9e19e reached production because `kamal deploy`
# builds whatever the local checkout is, and the checkout was a branch. Nothing
# refused it. .kamal/hooks/pre-build now refuses to build unless the checkout is
# main, has no modified tracked files, and equals origin/main. Each case below runs
# the real hook in a throwaway repository with a bare `origin`.
class PreBuildHookTest < ActiveSupport::TestCase
  HOOK = Rails.root.join(".kamal/hooks/pre-build").to_s

  setup do
    @dir = Dir.mktmpdir("pre-build-hook")
    @origin = File.join(@dir, "origin.git")
    @work = File.join(@dir, "work")
    git(@dir, "init", "-q", "--bare", "-b", "main", @origin)
    git(@dir, "clone", "-q", @origin, @work)
    git(@work, "config", "user.email", "hook@example.test")
    git(@work, "config", "user.name", "Hook")
    git(@work, "checkout", "-q", "-b", "main")
    commit("README", "one")
    git(@work, "push", "-q", "origin", "main")
  end

  teardown { FileUtils.rm_rf(@dir) }

  test "on main, clean and pushed: builds" do
    status, err = run_hook

    assert status.success?, err
  end

  test "on a branch: refuses, naming the branch" do
    git(@work, "checkout", "-q", "-b", "feature")
    git(@work, "push", "-q", "origin", "feature")

    status, err = run_hook

    assert_equal 1, status.exitstatus
    assert_match(/on 'feature', not main/, err)
  end

  test "on a branch with the override: builds, and says so loudly" do
    git(@work, "checkout", "-q", "-b", "hotfix")
    git(@work, "push", "-q", "origin", "hotfix")

    status, err = run_hook("KAMAL_ALLOW_BRANCH_DEPLOY" => "1")

    assert status.success?, err
    assert_match(/WARNING .*deploying branch 'hotfix' by explicit override/, err)
  end

  test "a modified tracked file: refuses" do
    File.write(File.join(@work, "README"), "edited")

    status, err = run_hook

    assert_equal 1, status.exitstatus
    assert_match(/tracked files are modified/, err)
  end

  # Kamal clones HEAD to build, so an untracked file never enters the image, and
  # the owner's checkout always has some (step files, local tool folders).
  test "an untracked file only: builds" do
    File.write(File.join(@work, "NOTES.md"), "scratch")

    status, err = run_hook

    assert status.success?, err
  end

  test "local main ahead of origin: refuses" do
    commit("README", "two")

    status, err = run_hook

    assert_equal 1, status.exitstatus
    assert_match(/!= origin\/main/, err)
  end

  private

  def run_hook(env = {})
    head = git(@work, "rev-parse", "HEAD").strip
    _out, err, status = Open3.capture3({ "KAMAL_VERSION" => head }.merge(env), "sh", HOOK, chdir: @work)
    [status, err]
  end

  def commit(file, contents)
    File.write(File.join(@work, file), contents)
    git(@work, "add", file)
    git(@work, "commit", "-q", "-m", contents)
  end

  def git(dir, *args)
    out, err, status = Open3.capture3("git", *args, chdir: dir)
    raise "git #{args.join(' ')} failed: #{err}" unless status.success?

    out
  end
end
