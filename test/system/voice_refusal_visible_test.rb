require "application_system_test_case"

# THE CLASS: a refusal the student cannot see.
#
# Same shape as the WP-22 defect (a turbo_stream aimed at an id that existed
# nowhere) and WP-24 §3 (an unanswerable check that still gated). The server
# behaves correctly and the student is told nothing.
#
# The owner recorded audio on an audio lesson and "nothing at all happened — no
# result, no error, no spinner resolving". `voice_recorder_controller` did:
#
#     if (!response.ok) { throw new Error(...) }   ->  catch  ->
#         console.error(...); this.showState("idle")
#
# So ANY non-OK answer — including the `head :forbidden` the entitlement gate
# returns for a route this student has not unlocked — put the widget back to
# idle with nothing on screen. That is correct policy with an invisible outcome,
# and it also made a refused submission indistinguishable from a job that never
# ran or a WebSocket that never delivered, which is why the cause could not be
# narrowed from the outside.
#
# This test does not assert WHICH refusal happened. It asserts that a refusal is
# legible, which is the thing that was missing and the instrument for diagnosing
# the rest.
class VoiceRefusalVisibleTest < ApplicationSystemTestCase
  def setup
    # Spanish on purpose: it exercises the non-default locale, which is what the
    # owner actually sees.
    @user = create_test_user(email_verified_at: Time.current, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    @step = @route.route_steps.create!(
      route_module: preview, title: "Audio", position: 0, status: :available,
      content_type: :lesson, delivery_format: "audio", level: :nv1, bloom_level: 1,
      metadata: { "parsed_sections" => [{ "type" => "concept", "title" => "A", "body" => "b" }],
                  "content_ready" => true }
    )
    # `_step_content_frame` only renders the audio lesson — and therefore the
    # recorder — when the step's content has ready audio.
    ContentEngine::AiContent.create!(
      route_step: @step, content_type: :text, body: "## Concepto: x\nbody",
      audio_status: "ready", audio_url: "/audio/example.mp3"
    )
    sign_in_through_ui
    visit learning_routes_engine.route_step_path(@route, @step)
  end

  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  test "a refused voice submission shows a specific message instead of going quiet" do
    skip_unless_recorder_present

    drive_submit_response(status: 403)

    assert_selector "[data-voice-recorder-target='stateError']", visible: true, wait: 5
    assert_equal I18n.t("voice_recorder.error_locked", locale: :es),
      find("[data-voice-recorder-target='errorMessage']").text,
      "a 403 is the entitlement gate; the student must be told that, not left staring at nothing"
  end

  test "a failed upload shows the generic message, not the entitlement one" do
    skip_unless_recorder_present

    drive_submit_response(status: 500)

    assert_selector "[data-voice-recorder-target='stateError']", visible: true, wait: 5
    assert_equal I18n.t("voice_recorder.error_failed", locale: :es),
      find("[data-voice-recorder-target='errorMessage']").text
  end

  test "the widget never silently returns to idle on a refusal" do
    skip_unless_recorder_present

    drive_submit_response(status: 403)

    assert_no_selector "[data-voice-recorder-target='stateIdle']:not(.hidden)", wait: 3
  end

  private

  # Drives the controller's own submit path with a stubbed `fetch`, so the
  # assertion is about what the STUDENT sees for a given server answer — not
  # about reproducing a particular server-side cause, which is the thing that
  # could not be narrowed from outside production.
  def drive_submit_response(status:)
    page.execute_script(<<~JS)
      window.fetch = () => Promise.resolve({
        ok: false,
        status: #{status},
        json: () => Promise.resolve({})
      })
      const el = document.querySelector("[data-controller~='voice-recorder']")
      const ctrl = window.Stimulus.getControllerForElementAndIdentifier(el, "voice-recorder")
      ctrl.recordingBlob = new Blob(["x"], { type: "audio/webm" })
      ctrl.submit()
    JS
  end

  # The recorder only renders on a step that offers a voice response. If the
  # fixture does not produce one, say so rather than passing vacuously.
  def skip_unless_recorder_present
    return if page.has_selector?("[data-controller~='voice-recorder']", visible: :all, wait: 5)

    skip "no voice-recorder on this step; fixture does not reach the widget"
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
