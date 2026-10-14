require "application_system_test_case"

# STEP 35 §3. What production will do the day WP-36 lands. Production has no word
# timings in the database, and the ElevenLabs key is burned, so narration for a
# motion section either was never generated or its generation failed. Either way
# the scene must play exactly as it does without narration:
#   - on its own fixed timings, with no cue sync (the button never reads "Pause",
#     which only `_mountWithAudio` sets);
#   - with no retry loop: a recorded failure is never asked about again, and a
#     pending one is checked once per explicit click, never on a timer;
#   - with no console error, uncaught error or unhandled rejection.
class MotionSceneWithoutTimingsTest < ApplicationSystemTestCase
  STATUS_REQUESTS = <<~JS.freeze
    performance.getEntriesByType('resource').filter(e => e.name.includes('/section_audio/') && e.name.endsWith('/status')).length
  JS

  def setup
    @user = Core::User.create!(
      name: "No timings", email: "motion-no-timings-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "en"
    )
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "No timings", locale: "en", status: :active
    )
    @preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
  end

  test "a section whose narration failed plays on fixed timings, never re-asks, and logs no error" do
    step = motion_step("audio_sections" => { "0" => { "status" => "failed" } })

    open_and_watch(step)
    play_twice

    assert_equal 1, page.evaluate_script(STATUS_REQUESTS),
      "a recorded failure must be asked about once, on the first click, and never again"
    assert_no_errors
  end

  test "a section with no narration yet plays on fixed timings and checks once per click, never on a timer" do
    step = motion_step({})

    open_and_watch(step)
    play_twice

    assert_equal 2, page.evaluate_script(STATUS_REQUESTS), "one check per explicit click"
    sleep 3 # a timer-driven retry would add requests while nobody clicks
    assert_equal 2, page.evaluate_script(STATUS_REQUESTS), "no request may happen without a click"
    assert_no_errors
  end

  private

  def motion_step(extra_metadata)
    data = { "steps" => ContentEngine::MotionScenes.example("transform")["steps"] }
    step = @route.route_steps.create!(
      route_module: @preview, title: "Motion", position: 0, status: :in_progress,
      content_type: :lesson, level: :nv1, bloom_level: 1,
      metadata: {
        "parsed_sections" => [
          { "type" => "motion", "scene" => "transform", "data" => data, "narration" => "Watch it change." }
        ],
        "content_ready" => true
      }.merge(extra_metadata)
    )
    ContentEngine::AiContent.create!(route_step: step, content_type: :text, body: "## Concept: x\nContent.")
    step
  end

  def open_and_watch(step)
    sign_in_through_ui
    visit learning_routes_engine.route_step_path(@route, step)
    assert_selector ".lesson-motion", wait: 10
    page.execute_script(<<~JS)
      window.__motionErrors = [];
      const original = console.error.bind(console);
      console.error = (...args) => { window.__motionErrors.push(args.map(String).join(" ")); original(...args); };
      window.addEventListener("error", (e) => window.__motionErrors.push("error: " + e.message));
      window.addEventListener("unhandledrejection", (e) => window.__motionErrors.push("rejection: " + String(e.reason)));
    JS
  end

  # Two explicit clicks. The scene paints on its fixed timings, and the label
  # stays "Play" because only the audio-backed mount ever sets it to "Pause".
  def play_twice
    find("[data-motion-scene-target='play']").click
    assert_selector ".lesson-motion__stage canvas", wait: 10
    assert_selector "[data-motion-scene-target='play']:not([disabled])", text: "Play", wait: 5
    find("[data-motion-scene-target='play']").click
    assert_selector "[data-motion-scene-target='play']:not([disabled])", text: "Play", wait: 5
    assert_no_selector "[data-motion-scene-target='play']", text: "Pause"
  end

  def assert_no_errors
    assert_equal [], page.evaluate_script("window.__motionErrors")
  end

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    assert_field "email", with: @user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
  end
end
