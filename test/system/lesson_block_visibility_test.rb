require "application_system_test_case"

# THE CLASS: "present in the DOM, zero pixels on screen".
#
# A `check` past section 0 rendered its modal inside its own `.lesson-section`,
# and every section after the first carries `display:none` — by design, because
# the controller deliberately never transitions to a check, it overlays the modal
# on the content the student is reading. A descendant of a `display:none`
# ancestor is not rendered at all, whatever its own styles say. `getComputedStyle`
# still reported `display:flex`, `opacity:1`, `visibility:visible`; only
# `getBoundingClientRect()` told the truth: [0, 0, 0, 0]. Every lesson with a
# check past section 0 was impossible to finish.
#
# Server-side everything was correct — BlockGrader, BlockAttemptRecorder, the
# `satisfied` field, the `block:graded` listener, the data-gating contract — and
# every one of those has a passing unit test. A Rails test does not compute
# layout, so no unit test could ever have caught this. That is the whole argument
# for this file.
class LessonBlockVisibilityTest < ApplicationSystemTestCase
  LB = ContentEngine::LessonBlocks

  CHECK_SECTION = {
    "type" => "check",
    "question" => "¿Cuál significa \"por favor\"?",
    "options" => [
      { "label" => "thank you", "correct" => false },
      { "label" => "help",      "correct" => false },
      { "label" => "please",    "correct" => true },
      { "label" => "sorry",     "correct" => false }
    ],
    "explanation" => "\"Por favor\" es \"please\"."
  }.freeze

  # One representative, RENDERABLE payload per declared block type. Built from
  # the keys each partial actually reads, so a block that renders nothing because
  # its payload is wrong cannot be mistaken for a block that renders nothing
  # because of a layout bug.
  SAMPLE = {
    "concept" => { "title" => "Concepto", "body" => "Un cuerpo suficientemente largo para ocupar altura." },
    "check" => CHECK_SECTION,
    "tip" => { "title" => "Consejo", "body" => "Un consejo útil y visible." },
    "example" => { "title" => "Ejemplo", "body" => "Un ejemplo con cuerpo real." },
    "summary" => { "title" => "Resumen", "body" => "Cierre de la lección.",
                   "key_points" => ["Punto uno", "Punto dos"] },
    "drag_drop" => { "title" => "Empareja",
                     "pairs" => [{ "term" => "Instancia", "definition" => "Computadora virtual" },
                                 { "term" => "AMI", "definition" => "Plantilla de arranque" }] },
    "fill_blank" => { "title" => "Completa", "sentence" => "Bom ___", "blanks" => ["dia"] },
    "code_playground" => { "title" => "Práctica", "language" => "python",
                           "code" => "print('hola')", "expected_output" => "hola" },
    "simulation" => { "title" => "Simulación", "body" => "Ajusta las variables.",
                      "formula" => "a * b",
                      "variables" => [{ "name" => "a", "min" => 1, "max" => 10, "default" => 2 },
                                      { "name" => "b", "min" => 1, "max" => 10, "default" => 3 }] },
    "scenario" => { "title" => "Escenario", "situation" => "El servidor no responde.",
                    "options" => [{ "label" => "Reiniciar", "consequence" => "Vuelve." },
                                  { "label" => "Ignorar", "consequence" => "Empeora." }] },
    "flashcards" => { "title" => "Tarjetas",
                      "cards" => [{ "front" => "AMI", "back" => "Plantilla" },
                                  { "front" => "EC2", "back" => "Cómputo" }] },
    "visual" => { "title" => "Diagrama", "body" => "Una imagen explicativa.",
                  "image_url" => "/icon.png", "alt_text" => "diagrama", "caption" => "Figura 1" },
    "audio" => { "title" => "Audio", "body" => "Narración de la lección.",
                 "audio_url" => "/audio/example.mp3" },
    "audio_explainer" => { "title" => "Explicación", "body" => "Narración larga.",
                           "audio_url" => "/audio/example.mp3" }
  }.freeze

  def setup
    @user = Core::User.create!(
      name: "Visibility", email: "visibility-#{SecureRandom.hex(4)}@example.com",
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

  # ── The defect ──────────────────────────────────────────────────────────

  test "a check past section 0 opens a modal that occupies real pixels" do
    open_lesson_with(["concept", "check"])
    advance_to_section_1

    rect = rect_for(".quiz-modal-backdrop[data-section-index='1']")

    assert_operator rect["width"], :>, 0,
      "the quiz modal has its content and zero width — a display:none ancestor"
    assert_operator rect["height"], :>, 0, "the quiz modal has zero height"
    assert_selector ".quiz-modal-backdrop[data-section-index='1'] .lesson-check__option",
      count: 4, visible: true
  end

  test "the quiz options are actually clickable, not just present" do
    open_lesson_with(["concept", "check"])
    advance_to_section_1

    # `visible: true` in Capybara means displayed; clicking is what proves the
    # element receives pointer events at real coordinates.
    within ".quiz-modal-backdrop[data-section-index='1']" do
      find(".lesson-check__option", text: "please").click
    end

    assert_selector ".quiz-modal-backdrop[data-section-index='1'] .lesson-check__feedback",
      visible: true, wait: 5
  end

  # The lesson had two adjacent checks; reaching the second must open the second
  # modal, not leave the first one on screen.
  test "adjacent checks open their own modal, not the stale one" do
    open_lesson_with(["concept", "check", "check"])
    advance_to_section_1

    answer_and_continue(1)

    assert_selector ".quiz-modal-backdrop[data-section-index='2']", visible: true, wait: 8
    assert_operator rect_for(".quiz-modal-backdrop[data-section-index='2']")["height"], :>, 0
    assert_equal 0, rect_for(".quiz-modal-backdrop[data-section-index='1']")["height"],
      "the first modal must be closed once the second opens"
  end

  # Arrived at from the other side: `_showQuizModal` is only reached from
  # `nextSection`, so a check at index 0 had no event to open it — an empty
  # section with Continuar locked by the gate and nothing to answer.
  test "a check that is the FIRST section still opens its modal" do
    open_lesson_with(["check", "concept"])

    assert_selector ".quiz-modal-backdrop[data-section-index='0']", visible: true, wait: 8
    assert_operator rect_for(".quiz-modal-backdrop[data-section-index='0']")["height"], :>, 0
  end

  # ── The gate ────────────────────────────────────────────────────────────

  test "answering the quiz satisfies the gate and unlocks the footer" do
    open_lesson_with(["concept", "check", "concept"])
    advance_to_section_1

    assert_equal "true", page.evaluate_script(
      "document.querySelector(\"[data-section-index='1'].lesson-section\").dataset.gating"
    ), "a check must gate navigation, or this test proves nothing"

    answer_and_continue(1)

    # The footer must stop saying "Responde para continuar" and become usable.
    # It unlocks only once the modal closes: `_locked` is cleared in
    # `_handleQuizModalClose`, not on selecting an option.
    assert_selector "[data-interactive-lesson-target='continueBtn']:not([disabled])", wait: 8
    assert_equal "false", page.evaluate_script(
      "String(document.querySelector(\"[data-interactive-lesson-target='continueBtn']\").disabled)"
    )
  end

  # ── The class ───────────────────────────────────────────────────────────

  # Every declared block type, rendered as the current section, must occupy real
  # pixels. This is the assertion no other test in this codebase can make.
  LB.types.each do |type|
    test "#{type} occupies real pixels once it is the current section" do
      assert SAMPLE.key?(type),
        "#{type} is declared in LessonBlocks but has no sample payload here; add one " \
        "so the new block type is covered by the zero-size assertion"

      open_lesson_with(["concept", type])
      advance_to_section_1

      selector = presenting_selector(type, 1)
      rect = rect_for(selector)

      assert_operator rect["width"], :>, 0,
        "#{type} renders with zero WIDTH at #{selector} — present in the DOM, invisible on screen"
      assert_operator rect["height"], :>, 0,
        "#{type} renders with zero HEIGHT at #{selector} — present in the DOM, invisible on screen"
    end
  end

  test "every declared block type has a sample payload" do
    assert_equal [], LB.types - SAMPLE.keys,
      "a block type with no payload here would silently skip the zero-size assertion"
  end

  private

  # The element that PRESENTS a block once its section is current. For a check
  # that is the modal, which no longer lives inside the section; for everything
  # else it is the section itself.
  def presenting_selector(type, index)
    if type == "check"
      ".quiz-modal-backdrop[data-section-index='#{index}']"
    else
      ".lesson-section[data-section-index='#{index}']"
    end
  end

  def rect_for(selector)
    page.evaluate_script(<<~JS)
      (() => {
        const el = document.querySelector("#{selector}")
        if (!el) return { width: -1, height: -1 }
        const r = el.getBoundingClientRect()
        return { width: r.width, height: r.height }
      })()
    JS
  end

  def open_lesson_with(types)
    sections = types.map { |type| SAMPLE.fetch(type).merge("type" => type) }
    @step = @route.route_steps.create!(
      title: "Lección", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1, bloom_level: 1,
      metadata: { "parsed_sections" => sections.map(&:deep_dup), "content_ready" => true }
    )
    ContentEngine::AiContent.create!(
      route_step: @step, content_type: :text, body: "## Concepto: x\nbody"
    )

    sign_in_through_ui
    visit learning_routes_engine.route_step_path(@route, @step)
    assert_selector "[data-interactive-lesson-target='sectionsContainer']", wait: 10
  end

  # The full student flow: pick the right option, then press Continuar INSIDE the
  # modal, which is what dispatches quiz:modal-close and clears `_locked`.
  def answer_and_continue(index)
    within ".quiz-modal-backdrop[data-section-index='#{index}']" do
      find(".lesson-check__option", text: "please").click
      find(".quiz-modal-continue", visible: true, wait: 8).click
    end
  end

  def advance_to_section_1
    find("[data-interactive-lesson-target='continueBtn']").click
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
