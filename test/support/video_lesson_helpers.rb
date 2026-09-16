module VideoLessonHelpers
  TOKEN = "s" * 48

  def auth(token) = { "Authorization" => "Bearer #{token}" }

  # A stand-in for Rails.application.credentials, used only by with_token below.
  # `dig` is the only method Admin::Api::BaseController calls on the real object.
  StudioCredentialsDouble = Struct.new(:token) do
    def dig(*keys)
      return nil if token.nil?
      { studio: { api_token: token } }.dig(*keys)
    end
  end

  # VERIFIED before this was written: `Rails.application.credentials.config[:studio] = ...`
  # does NOT work in Rails 8.1. `EncryptedConfiguration#dig` is delegated to `#options`
  # (an `ActiveSupport::OrderedOptions` tree built from `#config` and memoised
  # separately in `@options`), not to `#config` itself — so mutating `config` leaves
  # `dig` reading the stale, already-memoised `@options` and the credential never
  # changes. `minitest/mock` is not in this bundle, so `Object#stub` is unavailable
  # either way. This is the house idiom instead: a singleton swap on
  # `Rails.application.credentials` itself, restored in an `ensure` (see
  # `with_refused_guard` in test/services/content_engine/voice_evaluator_metering_test.rb).
  def with_token(value)
    original = Rails.application.method(:credentials)
    Rails.application.define_singleton_method(:credentials) { StudioCredentialsDouble.new(value) }
    yield
  ensure
    Rails.application.define_singleton_method(:credentials, original)
  end

  # A real minimal mp4 header, not random bytes: Task 6 validates `ftyp` at offset 4,
  # so a fixture of zeroes would make that validation untestable.
  def mp4_bytes = "\x00\x00\x00\x20ftypisom".b + ("\x00".b * 256)

  # A real PNG magic number, for the "renamed .mp4" case.
  def png_bytes = "\x89PNG\r\n\x1a\n".b + ("\x00".b * 64)

  def srt_bytes = "1\r\n00:00:00,000 --> 00:00:02,000\r\nHola.\r\n"

  def fixture_upload(bytes, filename, content_type)
    Rack::Test::UploadedFile.new(StringIO.new(bytes), content_type, original_filename: filename)
  end

  # A step with a persisted parsed_sections array, which is the state every generated
  # step is in and the state the publisher has to handle.
  def step_with_sections(sections, body: "## Concepto: X\nCuerpo.\n")
    user = create_test_user(email_verified_at: Time.current)
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: route.id, access_state: :preview
    )
    step = route.route_steps.create!(
      route_module: preview, title: "Paso", position: 0, status: :available,
      content_type: "lesson", delivery_format: "text", level: :nv1, bloom_level: 1
    )
    ContentEngine::AiContent.create!(route_step: step, content_type: :text, body: body)
    step.update!(metadata: { "parsed_sections" => sections, "content_ready" => true })
    @video_user = user
    step
  end

  def create_route_step_for_video = step_with_sections([{ "type" => "concept", "body" => "x" }])

  # Columns read from the real table, not guessed: user_id, route_step_id,
  # section_index, block_type, payload and attempts are all NOT NULL.
  def record_attempt!(step, section_index:, block_type: "check")
    LearningRoutesEngine::BlockAttempt.create!(
      user: @video_user, route_step: step, section_index: section_index,
      block_type: block_type, payload: {}, attempts: 1
    )
  end

  def video_path(step) = "/admin/api/steps/#{step.id}/video"

  def base_params
    { title: "La ese de la tercera persona", duration_seconds: 477,
      lesson_id: "third-person-s", voice: "english-teacher" }
  end

  def full_params
    base_params.merge(video: fixture_upload(mp4_bytes, "l.mp4", "video/mp4"),
                      subtitles: fixture_upload(srt_bytes, "l.srt", "application/x-subrip"))
  end

  # What LessonVideoPublisher.publish! takes, without the HTTP layer.
  def payload
    base_params.merge(video_url: "/rails/active_storage/blobs/proxy/abc/l.mp4",
                      subtitles_url: "/rails/active_storage/blobs/proxy/def/l.srt",
                      source: "manim-studio", published_at: "2026-09-16T13:00:04Z")
  end
end
