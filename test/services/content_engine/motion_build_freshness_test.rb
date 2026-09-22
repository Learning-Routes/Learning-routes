require "test_helper"

# THE CLASS: a committed build artifact drifts from its source.
#
# The image has no node, so mc.js is committed rather than built at deploy.
# Committing an artifact is only honest if it cannot silently disagree with the
# source it claims to be built from — otherwise the repo ships a file nobody can
# reproduce and nobody notices.
#
# Two derived artifacts, two headers, two checks, composing without circularity:
# mc.js covers EVERY build input (schemas.d.ts included, because it is an
# input); schemas.d.ts covers the schemas only, and its own check proves it
# matches them.
class MotionBuildFreshnessTest < ActiveSupport::TestCase
  test "mc.js was built from the source that is committed" do
    recorded = ContentEngine::MotionBuild.header_digest(ContentEngine::MotionBuild::ARTIFACT)
    assert recorded, "vendor/javascript/mc.js has no motion-src-sha256 header. Run bin/motion-build."
    assert_equal ContentEngine::MotionBuild.digest_for(:artifact), recorded,
      "app/motion changed without a rebuild. Run bin/motion-build and commit both outputs."
  end

  test "the generated types were built from the schemas that are committed" do
    recorded = ContentEngine::MotionBuild.header_digest(ContentEngine::MotionBuild::TYPES)
    assert recorded, "schemas.d.ts has no motion-schemas-sha256 header. Run bin/motion-build."
    assert_equal ContentEngine::MotionBuild.digest_for(:schemas), recorded,
      "a scene schema changed without regenerating the types, so Ruby validates a " \
      "shape the artifact does not implement."
  end

  # Without this, an exclude list that swallowed everything would make both
  # checks pass over an empty input set. An empty sweep is a broken sweep.
  test "the digest is looking at the inputs it thinks it is" do
    files = ContentEngine::MotionBuild.input_files(:artifact)

    assert_operator files.size, :>=, 8, "the input glob stopped matching app/motion"
    assert files.any? { |f| f.end_with?("main.ts") }
    assert files.any? { |f| f.end_with?("package-lock.json") },
      "the lockfile pins every dependency and must be an input"
    assert files.none? { |f| f.include?("/node_modules/") || f.include?("/dist/") }
  end

  # A bare "*" glob does not match dotfiles by default, so a file like
  # ".eslintrc" or ".npmrc" added under app/motion later would change what the
  # build consumes while moving nothing in the digest — the exact silent
  # drift this whole task exists to prevent. FNM_DOTMATCH closes that.
  test "a dotfile under app/motion is an input, not invisible to the glob" do
    path = Rails.root.join("app/motion/.motion_build_dotfile_test")
    original_digest = ContentEngine::MotionBuild.digest_for(:artifact)

    begin
      File.write(path, "dotfile content\n")

      assert_includes ContentEngine::MotionBuild.input_files(:artifact), path.to_s,
        "a dotfile under app/motion must be swept as an input"
      assert_not_equal original_digest, ContentEngine::MotionBuild.digest_for(:artifact),
        "adding a dotfile under app/motion must change the digest"
    ensure
      File.delete(path) if File.exist?(path)
    end

    assert_equal original_digest, ContentEngine::MotionBuild.digest_for(:artifact)
  end

  test "a changed input changes the digest" do
    before = ContentEngine::MotionBuild.digest_for(:artifact)
    path = Rails.root.join("app/motion/src/main.ts")
    original = File.read(path)
    begin
      File.write(path, original + "\n// touched by a test\n")
      assert_not_equal before, ContentEngine::MotionBuild.digest_for(:artifact)
    ensure
      File.write(path, original)
    end
    assert_equal before, ContentEngine::MotionBuild.digest_for(:artifact)
  end
end
