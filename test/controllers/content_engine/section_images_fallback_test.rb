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

  # Swap the service so nothing reaches OpenAI. The repo's idiom (see
  # call_site_locale_test) is define_method around the original.
  def with_stubbed_image_service
    svc = ContentEngine::ImageGenerationService
    original_generate = svc.instance_method(:generate)
    original_remaining = svc.instance_method(:images_remaining_for_step)
    svc.define_method(:generate) { |image_description:, metadata: {}|
      { image_url: "/fake-image.png", cost_cents: 0, generation_time_ms: 1 }
    }
    svc.define_method(:images_remaining_for_step) { 5 }
    yield
  ensure
    svc.define_method(:generate, original_generate)
    svc.define_method(:images_remaining_for_step, original_remaining)
  end

  test "a visual section resolves even when parsed_sections was never persisted" do
    assert_nil @step.metadata["parsed_sections"], "fixture must start without parsed_sections"

    with_stubbed_image_service do
      post generate_url(index_of("visual"))
    end

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal true, body["success"], "the controller failed on a description that is on screen"

    persisted = @step.reload.metadata["parsed_sections"]
    assert persisted.is_a?(Array), "the sections the page rendered against must be persisted"
    assert_equal "/fake-image.png", persisted[index_of("visual")]["image_url"]
  end

  test "a section with no description fails in the student language, not English" do
    post generate_url(index_of("concept"))

    assert_response :unprocessable_entity
    error = JSON.parse(response.body)["error"]
    assert_equal I18n.t("content_engine.image_generation.no_description", locale: :es), error
    assert_no_match(/No image description available/, error)
  end
end
