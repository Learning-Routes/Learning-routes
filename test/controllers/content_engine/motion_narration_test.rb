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

  # Review round 1: the two tests above only pin what `generate` ENQUEUES. They
  # would stay green even if SectionAudioGenerationJob#perform dropped the
  # `timestamps` argument on the floor instead of forwarding it — the exact
  # inert-feature failure this whole task exists to avoid, one layer further
  # down the chain. This test actually PERFORMS the job and proves the value
  # reaches `SectionAudioGenerator.generate!`.
  #
  # `SectionAudioGenerator.generate!` is swapped for a recorder for the
  # duration of the block, the same dependency-free singleton-swap-in-an-ensure
  # pattern as `with_refused_guard` in voice_evaluator_metering_test.rb. The
  # swap replaces `generate!` itself, so the real method — and therefore
  # AiOrchestrator::AiClient and any ElevenLabs HTTP call — is never reached.
  test "perform forwards timestamps to the generator: true for motion, false for a concept" do
    calls = []

    with_recorded_generate(calls) do
      perform_enqueued_jobs do
        post generate_url(0), params: { section_text: MOTION_SECTION["body"] }
        post generate_url(1), params: { section_text: CONCEPT_SECTION["body"] }
      end
    end

    motion_call = calls.find { |c| c[:section_index] == 0 }
    concept_call = calls.find { |c| c[:section_index] == 1 }

    assert motion_call, "the motion section's job never called the generator"
    assert concept_call, "the concept section's job never called the generator"
    assert_equal true, motion_call[:timestamps],
      "the job must forward timestamps: true through to the generator for a motion section"
    assert_equal false, concept_call[:timestamps],
      "a non-motion section must not ask ElevenLabs for word timings"
  end

  # WP-36 §16: the front end cannot tell a spend-guard refusal apart from any
  # other TTS failure unless the job records WHICH ceiling refused, and
  # `status` hands that back — motion_scene_controller.js needs it to show
  # the right one of the three `ai_orchestrator.spend_guard.*` sentences
  # rather than a generic "something broke". Mirrors the existing
  # `content_error_kind` distinction in ContentPipelineJob, one layer down.
  test "perform records which ceiling refused, and status surfaces it" do
    with_raising_generate(AiOrchestrator::SpendGuard::LimitExceeded.new("nope", kind: :daily_budget)) do
      perform_enqueued_jobs do
        post generate_url(0), params: { section_text: MOTION_SECTION["body"] }
      end
    end

    get status_url(0)

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal "failed", body["status"]
    assert_equal "daily_budget", body["kind"]
  end

  test "a non-guard failure surfaces no kind at all" do
    with_raising_generate(StandardError.new("elevenlabs is down")) do
      perform_enqueued_jobs do
        post generate_url(0), params: { section_text: MOTION_SECTION["body"] }
      end
    end

    get status_url(0)

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal "failed", body["status"]
    assert_not body.key?("kind"), "an ordinary failure is not a spend-guard refusal and must not claim to be one"
  end

  private

  def with_raising_generate(error)
    original = ContentEngine::SectionAudioGenerator.method(:generate!)
    ContentEngine::SectionAudioGenerator.define_singleton_method(:generate!) do |*_args, **_kwargs|
      raise error
    end
    yield
  ensure
    ContentEngine::SectionAudioGenerator.define_singleton_method(:generate!, original)
  end

  def with_recorded_generate(calls)
    original = ContentEngine::SectionAudioGenerator.method(:generate!)
    ContentEngine::SectionAudioGenerator.define_singleton_method(:generate!) do |step_id, section_index, _section_text, locale: "en", target_locale: nil, timestamps: false|
      calls << { step_id: step_id, section_index: section_index, locale: locale, target_locale: target_locale, timestamps: timestamps }
      nil
    end
    yield
  ensure
    ContentEngine::SectionAudioGenerator.define_singleton_method(:generate!, original)
  end
end
