require "application_system_test_case"

# WP-36 §16, fix round 1. WP-20 §C is deliberate: a preview module generates
# narration ON DEMAND, so the student's FIRST play of a motion block is always
# before that narration exists. motion_scene_controller.js's first click
# therefore always mounts on fixed timings (see motion_scene_test.rb) — that
# part is correct and unchanged here.
#
# The bug this file exists to catch: once `_handle` is mounted, the ONLY guard
# on a later click was `!this._handle`, so it never fetched narration status
# again. In the free preview module — the product's showcase — a student who
# played once and clicked play/replay again would be stuck on fixed timings
# for the rest of the session, even though the narration this task exists to
# sync to had finished generating in the background seconds after the first
# click. Only a full page reload ever picked it up. This proves the SECOND
# click re-checks and upgrades to the synced, audio-backed path when the
# narration has since arrived — without turning the FIRST click into a poll,
# and without the fixed guard-refused case ever re-checking at all.
class MotionSceneNarrationRetryTest < ApplicationSystemTestCase
  def setup
    @user = Core::User.create!(
      name: "Retry", email: "motion-retry-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "en"
    )
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Retry", locale: "en", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    data = { "steps" => ContentEngine::MotionScenes.example("transform")["steps"] }
    @step = @route.route_steps.create!(
      route_module: preview, title: "Motion", position: 0, status: :in_progress,
      content_type: :lesson, level: :nv1, bloom_level: 1,
      metadata: {
        "parsed_sections" => [
          { "type" => "motion", "scene" => "transform", "data" => data, "narration" => "Watch it change." }
        ],
        # Simulates generation already in flight — e.g. a prefetch attempt, or
        # this same click a moment earlier. Seeding "generating" (rather than
        # leaving it absent, which is "pending") means the FIRST click below
        # never itself POSTs to `generate` — it only reads `status` — so
        # there is no race between that fire-and-forget request and the
        # metadata write this test makes between the two clicks.
        "audio_sections" => { "0" => { "status" => "generating" } },
        "content_ready" => true
      }
    )
    ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: "## Concept: x\nContent.")
  end

  test "a replay re-checks narration status and upgrades to the synced path once it exists" do
    sign_in_through_ui
    visit learning_routes_engine.route_step_path(@route, @step)
    assert_selector ".lesson-motion", wait: 10

    find("[data-motion-scene-target='play']").click

    # First click: narration is not ready, so this mounts on fixed timings.
    # `_mountWithAudio` is the ONLY code path that ever sets the button's
    # label to "Pause" — deterministically, not a timing race — so seeing the
    # canvas paint while the label stays "Play" proves the fixed-timing path,
    # never the audio one, was taken here.
    assert_selector ".lesson-motion__stage canvas", wait: 10
    assert_selector "[data-motion-scene-target='play']", text: "Play", wait: 5

    # Narration "finishes" in the background, exactly as it would once
    # SectionAudioGenerationJob completes for real.
    @step.merge_metadata!(
      "audio_sections" => {
        "0" => {
          "status" => "ready", "url" => "/storage/audio/sections/does-not-need-to-exist.mp3",
          "duration" => 2.0, "words" => [{ "text" => "Watch", "start" => 0.0, "end" => 0.3 }]
        }
      }
    )

    find("[data-motion-scene-target='play']").click

    # Second click (a replay of the fixed-timing mount): re-checked status,
    # found it ready, and mounted the audio-synced path instead — the ONLY
    # path that sets this label to "Pause".
    assert_selector "[data-motion-scene-target='play']", text: "Pause", wait: 10
  end

  private

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    assert_field "email", with: @user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
  end
end
