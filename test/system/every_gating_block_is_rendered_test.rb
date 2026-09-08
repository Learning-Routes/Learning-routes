require "application_system_test_case"

# THE CLASS: a gate counts a block the page does not show.
#
# WP-35 §3. The owner's screenshot is an English-for-beginners exercise rendering
# a header reading JAVASCRIPT, an empty code editor, "Enviar respuesta" and
# "Pista". The exercise's real content — the `## Match` and `## Complete` blocks
# the SAME `lesson_content` prompt produced — is parsed by
# `stage_section_parsing!`, persisted into `metadata["parsed_sections"]`, and
# counted by `RouteStep#outstanding_blocks_for`. It is never drawn.
#
# So `steps#complete` refuses with `blocks_required` naming section indices that
# do not exist on the page, and the student has nothing to click. In the owner's
# route that is three exercise steps plus twelve reinforcement "Guided Practice"
# steps, none of them finishable — except through the side door WP-32 has now
# closed, which is why this is the first thing in this package.
#
# The assertion is deliberately not "the exercise view looks right". It is the
# contract between the SERVER'S gate and the DOM: for every section index the
# server would refuse on, the page must carry an element at that index running
# that block's controller. That holds for lessons today and must hold for
# exercises too — and for whatever content type persists sections next.
class EveryGatingBlockIsRenderedTest < ApplicationSystemTestCase
  BG = LearningRoutesEngine::BlockGrader

  # Every type in BlockGrader::GATING_TYPES, with the Stimulus controller its
  # partial mounts. A gating type missing from here fails the sweep below rather
  # than being silently skipped.
  GATING_CONTROLLERS = {
    "check" => "lesson-check",
    "drag_drop" => "drag-drop",
    "fill_blank" => "fill-blank",
    "flashcards" => "flashcards",
    "scenario" => "scenario"
  }.freeze

  SAMPLE = {
    "check" => { "question" => "¿Cuál significa \"por favor\"?",
                 "options" => [{ "label" => "please", "correct" => true },
                               { "label" => "sorry", "correct" => false }] },
    "drag_drop" => { "title" => "Empareja",
                     "pairs" => [{ "term" => "Instancia", "definition" => "Computadora virtual" },
                                 { "term" => "AMI", "definition" => "Plantilla" }] },
    "fill_blank" => { "title" => "Completa", "sentence" => "Bom ___", "blanks" => ["dia"] },
    "flashcards" => { "title" => "Tarjetas",
                      "cards" => [{ "front" => "AMI", "back" => "Plantilla" },
                                  { "front" => "EC2", "back" => "Cómputo" }] },
    "scenario" => { "title" => "Escenario", "situation" => "El servidor no responde.",
                    "options" => [{ "label" => "Reiniciar", "consequence" => "Vuelve." },
                                  { "label" => "Ignorar", "consequence" => "Empeora." }] }
  }.freeze

  # The content types whose `parsed_sections` the gate reads. `assessment` and
  # `review` are absent because `ContentPipelineJob` persists sections only for
  # these two.
  GATED_CONTENT_TYPES = %w[lesson exercise].freeze

  def setup
    @user = Core::User.create!(
      name: "Gating Sweep", email: "gating-sweep-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
  end

  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  test "every gating type is declared here" do
    assert_equal [], BG::GATING_TYPES - GATING_CONTROLLERS.keys,
      "a gating block type with no controller declared here would skip the sweep"
    assert_equal [], BG::GATING_TYPES - SAMPLE.keys,
      "a gating block type with no payload here would skip the sweep"
  end

  GATED_CONTENT_TYPES.each do |content_type|
    test "#{content_type}: every block the gate counts is on the page" do
      step = open_step_with_every_gating_block(content_type)

      outstanding = step.outstanding_blocks_for(@user)
      assert_equal BG::GATING_TYPES.size, outstanding.size,
        "the fixture must leave every gating block outstanding, or this proves nothing"

      missing = outstanding.reject do |block|
        controller = GATING_CONTROLLERS.fetch(block[:block_type])
        page.has_css?(
          "[data-section-index='#{block[:section_index]}'] [data-controller~='#{controller}'], " \
          "[data-section-index='#{block[:section_index]}'][data-controller~='#{controller}']",
          visible: :all, wait: 2
        )
      end

      assert_equal [], missing.map { |b| "#{b[:block_type]}@#{b[:section_index]}" },
        "#{content_type}: the server refuses `complete` naming these section indices, and the " \
        "page has no element for them — the student is asked to answer blocks that are not drawn"
    end

    test "#{content_type}: a section element exists for every persisted section" do
      open_step_with_every_gating_block(content_type)

      assert_selector ".lesson-section", count: BG::GATING_TYPES.size, visible: :all, wait: 10
    end
  end

  private

  def open_step_with_every_gating_block(content_type)
    sections = BG::GATING_TYPES.map { |type| SAMPLE.fetch(type).merge("type" => type) }
    step = @route.route_steps.create!(
      title: "Paso #{content_type}", position: 0, status: :available,
      content_type: content_type, delivery_format: "text", level: 1, bloom_level: 1,
      metadata: { "parsed_sections" => sections.map(&:deep_dup), "content_ready" => true }
    )
    ContentEngine::AiContent.create!(
      route_step: step,
      content_type: content_type == "exercise" ? :exercise : :text,
      body: "## Concepto: x\nbody"
    )

    sign_in_through_ui
    visit learning_routes_engine.route_step_path(@route, step)
    assert_selector "h1", wait: 10
    step
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
