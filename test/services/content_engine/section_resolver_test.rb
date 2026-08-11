require "test_helper"

# The gate that did not hold.
#
# StepsController could always parse the AiContent body on the fly when
# metadata["parsed_sections"] was missing, and it threw the result away. So the page
# rendered an unanswered exercise from sections that existed only in that request,
# while RouteStep#outstanding_blocks_for read the empty metadata, found no blocks, and
# let the student walk straight past it.
#
# In production 14 of 21 steps were in that state. Two thirds of the product had an
# invisible gate, and the same root cause had already been patched twice elsewhere —
# once in SectionImagesController ("no image description available" about a description
# on screen) and once in the AI tools (an empty lesson context, so "give an example"
# asked which concept the student meant).
class ContentEngine::SectionResolverTest < ActiveSupport::TestCase
  LESSON = <<~MD.freeze
    ## Concepto: EC2
    Computadoras que alquilas en AWS.

    ## Pregunta: Que es EC2?
    A) Una base de datos
    B) Computo bajo demanda
    C) Un firewall
    D) Una region
    CORRECTA: B
    EXPLICACION: EC2 es computo bajo demanda.
  MD

  def setup
    @user = Core::User.create!(
      name: "Resolver",
      email: "sr-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "programming", locale: "es", status: :active
    )
    @step = @route.route_steps.create!(
      title: "Paso", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1
    )
    ContentEngine::AiContent.create!(
      route_step: @step, content_type: :text, body: LESSON, ai_model: "test"
    )
    # The production state: content exists, parsed_sections never persisted.
    assert_nil @step.metadata["parsed_sections"]
  end

  test "parses and persists when the metadata is empty" do
    sections = ContentEngine::SectionResolver.call(@step)

    assert sections.any?, "a lesson with two headings must resolve to sections"
    assert_equal sections, @step.reload.metadata["parsed_sections"],
      "what it parsed must be persisted, or the next consumer sees nothing again"
  end

  test "returns the persisted sections untouched when they exist" do
    stored = [{ "type" => "concept", "title" => "ya guardado", "body" => "x" }]
    @step.update!(metadata: (@step.metadata || {}).merge("parsed_sections" => stored))

    assert_equal stored, ContentEngine::SectionResolver.call(@step)
  end

  test "a step with no content resolves to no sections rather than raising" do
    ContentEngine::AiContent.where(route_step: @step).destroy_all

    assert_equal [], ContentEngine::SectionResolver.call(@step)
  end

  # The regression this file exists for.
  test "the block gate holds even when parsed_sections was never persisted" do
    outstanding = @step.outstanding_blocks_for(@user)

    assert outstanding.any?,
      "the step shows an unanswered check block; the gate must see it too"
    assert_equal "check", outstanding.first[:block_type]
  end
end
