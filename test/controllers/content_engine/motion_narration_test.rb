require "test_helper"

# WP-36 §15: the audio endpoints serve motion. A motion scene's narration
# drives mc.js's caption/emphasis timing (Task 16), which needs ElevenLabs'
# word-level alignment — so `generate` asks for `timestamps: true` only when
# the section being narrated is a motion block, and `status` hands the
# stored `words` array back once it exists. Every other section type keeps
# paying for plain audio, no alignment call, no `words` key at all.
class ContentEngine::MotionNarrationTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  MOTION_SECTION = {
    "type" => "motion", "scene" => "orbit", "data" => {},
    "narration" => "Mira cómo orbita.", "aftermath" => nil,
    "body" => "Mira cómo orbita."
  }.freeze

  CONCEPT_SECTION = {
    "type" => "concept", "body" => "Un concepto cualquiera."
  }.freeze

  def setup
    @user = create_test_user(locale: "es", email_verified_at: Time.current)
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "Astronomy", locale: "es", status: :active
    )
    @step = @route.route_steps.create!(
      title: "Paso", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1,
      metadata: { "parsed_sections" => [MOTION_SECTION, CONCEPT_SECTION] }
    )
    sign_in_as(@user)
  end

  def generate_url(section_index) = "/content/section_audio/#{@step.id}/#{section_index}/generate"
  def status_url(section_index) = "/content/section_audio/#{@step.id}/#{section_index}/status"

  test "generate requests timestamps for a motion section" do
    job = assert_enqueued_with(job: ContentEngine::SectionAudioGenerationJob) do
      post generate_url(0), params: { section_text: MOTION_SECTION["body"] }
    end

    assert_equal true, job.arguments.last,
      "a motion section's narration must ask ElevenLabs for word timings"
  end

  test "generate does not request timestamps for a non-motion section" do
    job = assert_enqueued_with(job: ContentEngine::SectionAudioGenerationJob) do
      post generate_url(1), params: { section_text: CONCEPT_SECTION["body"] }
    end

    assert_equal false, job.arguments.last
  end

  test "status includes words once the motion narration has landed" do
    words = [{ "text" => "Mira", "start" => 0.0, "end" => 0.3 }]
    @step.merge_metadata!(
      "audio_sections" => {
        "0" => { "status" => "ready", "url" => "/x/0.mp3", "duration" => 2.5, "words" => words }
      }
    )

    get status_url(0)

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal "ready", body["status"]
    assert_equal words, body["words"]
  end

  test "status omits the words key rather than sending null when nothing was stored" do
    @step.merge_metadata!(
      "audio_sections" => {
        "1" => { "status" => "ready", "url" => "/x/1.mp3", "duration" => 1.2 }
      }
    )

    get status_url(1)

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal "ready", body["status"]
    assert_not body.key?("words"), "words must be omitted entirely, not sent as null"
  end
end
