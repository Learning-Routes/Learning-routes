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
    with_private_motion_tree do |root|
      path = root.join("app/motion/.motion_build_dotfile_test")
      original_digest = ContentEngine::MotionBuild.digest_for(:artifact)

      File.write(path, "dotfile content\n")

      assert_includes ContentEngine::MotionBuild.input_files(:artifact), path.to_s,
        "a dotfile under app/motion must be swept as an input"
      assert_not_equal original_digest, ContentEngine::MotionBuild.digest_for(:artifact),
        "adding a dotfile under app/motion must change the digest"

      File.delete(path)
      assert_equal original_digest, ContentEngine::MotionBuild.digest_for(:artifact)
    end
  end

  # The committed artifact was digested from a clean checkout. A file git ignores,
  # such as the .DS_Store Finder drops on a developer's disk, is never committed,
  # so it must not move the digest either.
  test "a file git ignores is not an input" do
    with_private_motion_tree do |root|
      before = ContentEngine::MotionBuild.digest_for(:artifact)
      junk = %w[app/motion/.DS_Store app/motion/src/.DS_Store app/motion/src/main.ts.swp
                app/motion/src/main.ts.swo app/motion/src/main.ts~].map { |rel| root.join(rel) }
      junk.each { |path| File.write(path, "junk\n") }

      assert_empty ContentEngine::MotionBuild.input_files(:artifact) & junk.map(&:to_s)
      assert_equal before, ContentEngine::MotionBuild.digest_for(:artifact)
    end
  end

  # The digest cannot ask git (see MotionBuild), so its list must say what
  # .gitignore says.
  test "every name the digest ignores is ignored by git too" do
    gitignore = File.readlines(Rails.root.join(".gitignore"), chomp: true)

    ContentEngine::MotionBuild::IGNORED_NAMES.each do |name|
      assert gitignore.include?(name) || gitignore.include?("**/#{name}"), "#{name} is not in .gitignore"
    end
  end

  test "a changed input changes the digest" do
    with_private_motion_tree do |root|
      before = ContentEngine::MotionBuild.digest_for(:artifact)
      path = root.join("app/motion/src/main.ts")
      original = File.read(path)

      File.write(path, original + "\n// touched by a test\n")
      assert_not_equal before, ContentEngine::MotionBuild.digest_for(:artifact)

      File.write(path, original)
      assert_equal before, ContentEngine::MotionBuild.digest_for(:artifact)
    end
  end

  private

  # The two tests above change an input on purpose. They used to change the real
  # app/motion, so under parallel workers one test's edit was another's input: CI
  # (PR #46) saw a digest that did not come back, and a concurrent run left
  # main.ts committed-dirty with "// touched by a test". Each now edits a private
  # copy of the inputs, with Rails.root pointed at it in this process only.
  def with_private_motion_tree
    real = ContentEngine::MotionBuild.digest_for(:artifact)
    Dir.mktmpdir("motion-tree") do |dir|
      root = Pathname.new(dir)
      ContentEngine::MotionBuild.input_files(:artifact).each do |file|
        next unless File.file?(file)

        target = root.join(Pathname.new(file).relative_path_from(Rails.root))
        FileUtils.mkdir_p(target.dirname)
        FileUtils.cp(file, target)
      end
      original_root = Rails.method(:root)
      Rails.define_singleton_method(:root) { root }
      begin
        assert_equal real, ContentEngine::MotionBuild.digest_for(:artifact),
          "the private copy must hold every input, or the test proves nothing"
        yield root
      ensure
        Rails.define_singleton_method(:root, original_root)
      end
    end
  end
end
