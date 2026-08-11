require "test_helper"

# The "Ilustrar con AI" button answered "No image description available" about a
# description the student could read on the same screen.
#
# StepsController#load_step_content has two branches: it uses
# metadata["parsed_sections"] when present, and otherwise parses the AiContent body
# on the fly. In that second branch the page renders every section correctly while
# the metadata key stays empty — so SectionImagesController, which only ever read
# the metadata, resolved nothing. The index was never the problem; the table it was
# indexing into did not exist.
#
# The message was also the one string in that controller not passed through I18n,
# so it reached Spanish students in English.
class ContentEngine::SectionImagesFallbackTest < ActionDispatch::IntegrationTest
  VISUAL_BODY = <<~MD.freeze
    ## Concepto: La nube
    Servidores a los que llegas por internet.

    ## Visual: Diagrama de la nube
    Una nube central conectada a un portátil, un móvil y un servidor.
  MD

  def setup
    @user = Core::User.create!(
      name: "Section Images",
      email: "si-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "programming", locale: "es", status: :active
    )
    @step = @route.route_steps.create!(
      title: "Paso", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1
    )
    # Content exists, parsed_sections deliberately does not — the exact state the
    # view renders happily and the controller used to choke on.
    ContentEngine::AiContent.create!(
      route_step: @step, content_type: :text, body: VISUAL_BODY, ai_model: "test"
    )
    post "/sign_in", params: { email: @user.email, password: "password123" }
  end

  def sections
    @sections ||= ContentEngine::LessonSectionParser.call(VISUAL_BODY).map(&:as_json)
  end

  def index_of(type)
    sections.index { |s| s["type"] == type } or flunk("no #{type} section in the fixture")
  end

  # The Stimulus controller builds this path by hand
  # (image_generate_controller.js:27) — there is no named helper, so the test uses
  # the same literal path the browser posts to.
  def generate_url(section_index)
    "/content/section_images/#{@step.id}/#{section_index}/generate"
  end

  test "a visual section resolves even when parsed_sections was never persisted" do
    assert_nil @step.metadata["parsed_sections"], "fixture must start without parsed_sections"

    assert_enqueued_with(job: ContentEngine::SectionImageJob) do
      post generate_url(index_of("visual"))
    end

    assert_response :accepted
    assert_equal "generating", JSON.parse(response.body)["status"]

    persisted = @step.reload.metadata["parsed_sections"]
    assert persisted.is_a?(Array), "the sections the page rendered against must be persisted"
    assert_equal "generating", persisted[index_of("visual")]["image_status"]
  end

  # Generation takes 30-90s. Doing it in the request timed out at the proxy (504) and
  # then killed the Puma worker (502), so the endpoint must never block on it.
  test "generate enqueues and answers immediately, it does not generate inline" do
    assert_enqueued_jobs 1, only: ContentEngine::SectionImageJob do
      post generate_url(index_of("visual"))
    end

    assert_response :accepted
  end

  test "status reports generating, then the image once the job has written it" do
    post generate_url(index_of("visual"))
    get "/content/section_images/#{@step.id}/#{index_of('visual')}/status"

    assert_response :success
    assert_equal "generating", JSON.parse(response.body)["status"]

    # Simulate the job landing.
    metadata = @step.reload.metadata
    parsed = metadata["parsed_sections"]
    parsed[index_of("visual")]["image_url"] = "/fake-image.png"
    parsed[index_of("visual")]["image_status"] = "ready"
    @step.update!(metadata: metadata.merge("parsed_sections" => parsed))

    get "/content/section_images/#{@step.id}/#{index_of('visual')}/status"
    body = JSON.parse(response.body)
    assert_equal "ready", body["status"]
    assert_equal "/fake-image.png", body["image_url"]
  end

  test "a section with no description fails in the student language, not English" do
    post generate_url(index_of("concept"))

    assert_response :unprocessable_entity
    error = JSON.parse(response.body)["error"]
    assert_equal I18n.t("content_engine.image_generation.no_description", locale: :es), error
    assert_no_match(/No image description available/, error)
  end
end
