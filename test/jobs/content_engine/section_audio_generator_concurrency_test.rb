require "test_helper"

# WP-36 §13, code review round 1 finding: the sequential test in
# StepMetadataWriteIsolationTest ("writing words for one section does not
# erase another section's audio") proves the words write is not a whole-blob
# rewrite, but it can never exercise `with_lock` itself.
# `update_step_audio_status!` does a fresh `RouteStep.find` on every call, so
# a single call, after the sibling already exists in the database, can never
# construct the "stale read predates a competing commit" window the lock
# exists to close — there is no second writer racing it within that test.
#
# This test builds that window for real, with two threads racing on the same
# step, each writing a DIFFERENT section index concurrently — the actual
# scenario `with_lock`'s comment in SectionAudioGenerator describes.
#
# Modeled on test/controllers/learning_routes_engine/block_attempt_concurrency_test.rb:
# real threads, real Postgres connections, no transactional-fixture rollback
# (each thread needs its own backend connection to see — or fail to see —
# the other's commits, which a shared wrapping transaction would hide).
class ContentEngine::SectionAudioGeneratorConcurrencyTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  def setup
    assert_equal "PostgreSQL", ActiveRecord::Base.connection.adapter_name

    @user = create_test_user
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "Concurrency", locale: "en"
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    @step = LearningRoutesEngine::RouteStep.create!(
      learning_route: @route, route_module: preview, position: 1,
      title: "Lesson", content_type: :lesson, status: :available
    )
  end

  def teardown
    LearningRoutesEngine::RouteStep.where(id: @step.id).delete_all
    LearningRoutesEngine::LearningRoute.where(id: @route.id).delete_all
    LearningRoutesEngine::LearningProfile.where(id: @profile.id).delete_all
    Core::User.where(id: @user.id).delete_all
  end

  # How the race is forced, deterministically, without a real DB-blocking
  # probe (this file has none of block_attempt_concurrency_test's
  # pg_stat_activity plumbing to reuse, and the reviewer's note allows a
  # documented sleep as the fallback):
  #
  # We patch RouteStep#merge_metadata! so that exactly ONE of the two
  # concurrent calls — whichever reaches it first, decided by a Mutex-guarded
  # flag — sleeps for DELAY seconds before actually writing; the other call
  # writes immediately. The delayed caller's local `audio_sections` hash was
  # already built (read) before it started sleeping, so if nothing
  # serializes the two writers, the immediate caller commits first and the
  # delayed caller's later write — built from a hash that predates the
  # immediate caller's commit — clobbers it. With `with_lock` in place, the
  # immediate caller cannot even acquire its row lock until the delayed
  # caller's transaction (which holds the lock across the sleep) commits, so
  # by the time it reads, `with_lock`'s reload sees the delayed caller's
  # entry and both survive. DELAY is generous (700ms) relative to the
  # sub-millisecond work being raced, so the unlocked call has ample time to
  # finish inside that window without relying on OS scheduling luck.
  DELAY = 0.7

  test "concurrent writes to different section indices both survive" do
    mutex = Mutex.new
    delayed_once = false
    original_merge = LearningRoutesEngine::RouteStep.instance_method(:merge_metadata!)

    LearningRoutesEngine::RouteStep.define_method(:merge_metadata!) do |attributes|
      should_delay = mutex.synchronize do
        next false if delayed_once

        delayed_once = true
        true
      end
      sleep(DELAY) if should_delay
      original_merge.bind(self).call(attributes)
    end

    words0 = [{ "text" => "Mira", "start" => 0.0, "end" => 0.3 }]
    words1 = [{ "text" => "el", "start" => 0.0, "end" => 0.2 }]

    threads = [
      Thread.new do
        ContentEngine::SectionAudioGenerator.new(@step.id, 0, "x").send(
          :update_step_audio_status!, "ready", "/a/0.mp3", 1.0, words: words0
        )
      end,
      Thread.new do
        ContentEngine::SectionAudioGenerator.new(@step.id, 1, "y").send(
          :update_step_audio_status!, "ready", "/a/1.mp3", 1.0, words: words1
        )
      end
    ]

    threads.each { |thread| assert thread.join(5), "writer thread did not finish" }

    sections = @step.reload.metadata["audio_sections"]
    assert_equal "/a/0.mp3", sections.dig("0", "url"), "section 0 was erased by the concurrent write"
    assert_equal "/a/1.mp3", sections.dig("1", "url"), "section 1 was erased by the concurrent write"
    assert_equal "Mira", sections.dig("0", "words", 0, "text"), "section 0's words were erased"
    assert_equal "el", sections.dig("1", "words", 0, "text"), "section 1's words were erased"
  ensure
    LearningRoutesEngine::RouteStep.define_method(:merge_metadata!, original_merge) if original_merge
    threads&.each { |thread| thread.kill if thread.alive? }
  end
end
