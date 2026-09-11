require "application_system_test_case"

# WP-33 §2, the half that is not the parser.
#
# The parser now keeps what the author wrote after a `## Pregunta` — the mermaid
# diagram `lesson_content.yml` places right behind the CYCLE 2 check — and
# `_lesson.html.erb` renders it inside the check's own `.lesson-section`. But
# that element was the one section the lesson never showed going forward:
# `_handleQuizModalClose` closed the modal and transitioned straight to the
# section after the check. The recovered diagram was in the DOM and invisible.
#
# So: a check WITH an aftermath lands on its section after the modal, and
# Continue moves on from there; a check WITHOUT one is skipped, exactly as
# before. Both are pinned, because the second is the behaviour every existing
# lesson has today and the first must not change it.
class CheckAftermathIsShownTest < ApplicationSystemTestCase
  CHECK = {
    "type" => "check",
    "question" => "¿Cuál significa \"por favor\"?",
    "options" => [
      { "label" => "thank you", "correct" => false },
      { "label" => "please",    "correct" => true }
    ],
    "explanation" => "\"Por favor\" es \"please\"."
  }.freeze

  AFTERMATH = <<~MARKDOWN.freeze
    Mira el diagrama antes de seguir.

    ```mermaid
    graph LR
      A[por favor] --> B[please]
    ```
  MARKDOWN

  CONCEPT = { "type" => "concept", "title" => "Intro", "body" => "Cuerpo de la introducción." }.freeze
  SUMMARY = { "type" => "summary", "title" => "Resumen", "body" => "Cierre.", "key_points" => ["Uno"] }.freeze

  CHECK_INDEX = 1

  def setup
    @user = Core::User.create!(
      name: "Aftermath", email: "aftermath-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
  end

  test "a check with an aftermath lands on its section after the modal, and Continue moves on" do
    open_lesson_with(CHECK.merge("aftermath" => AFTERMATH))

    answer_the_check

    assert_selector section_selector(CHECK_INDEX), visible: true, wait: 8
    within section_selector(CHECK_INDEX) do
      assert_text "Mira el diagrama antes de seguir."
      # The diagram the parser recovered, on screen. Its rendering is Mermaid's
      # job and is covered in MermaidFailureIsQuietTest; here the container
      # having a box is the assertion.
      assert_selector ".mermaid-container", visible: true
    end
    assert_no_selector modal_selector(CHECK_INDEX), visible: true
    assert_equal [CHECK_INDEX], shown_section_indexes,
      "exactly one section may be on screen; the section the student was " \
      "reading before the modal stayed visible underneath"

    find("[data-interactive-lesson-target='continueBtn']").click

    assert_selector section_selector(2), visible: true, wait: 8
    assert_equal [2], shown_section_indexes
  end

  test "a check without an aftermath is skipped, exactly as before" do
    open_lesson_with(CHECK)

    answer_the_check

    assert_selector section_selector(2), visible: true, wait: 8
    assert_equal [2], shown_section_indexes,
      "a check with nothing to show must not become a blank page the student " \
      "has to click through, and the section before it must not linger"
  end

  test "going back onto the check shows the aftermath again without reopening the modal" do
    open_lesson_with(CHECK.merge("aftermath" => AFTERMATH))

    answer_the_check
    assert_selector section_selector(CHECK_INDEX), visible: true, wait: 8
    find("[data-interactive-lesson-target='continueBtn']").click
    assert_selector section_selector(2), visible: true, wait: 8

    find("[data-interactive-lesson-target='backBtn']").click

    assert_selector section_selector(CHECK_INDEX), visible: true, wait: 8
    within(section_selector(CHECK_INDEX)) { assert_text "Mira el diagrama antes de seguir." }
    assert_no_selector modal_selector(CHECK_INDEX), visible: true
    assert_equal [CHECK_INDEX], shown_section_indexes
  end

  private

  def open_lesson_with(check)
    @step = @route.route_steps.create!(
      title: "Lección", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: :nv1, bloom_level: 1,
      metadata: { "parsed_sections" => [CONCEPT.deep_dup, check.deep_dup, SUMMARY.deep_dup],
                  "content_ready" => true }
    )
    ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: "## Concepto: x\nbody")

    sign_in_through_ui
    visit learning_routes_engine.route_step_path(@route, @step)
    assert_selector "[data-interactive-lesson-target='sectionsContainer']", wait: 10
    assert_equal [0], shown_section_indexes
  end

  def answer_the_check
    find("[data-interactive-lesson-target='continueBtn']").click
    assert_selector modal_selector(CHECK_INDEX), visible: true, wait: 8
    within modal_selector(CHECK_INDEX) do
      find(".lesson-check__option", text: "please", match: :prefer_exact).click
      find(".quiz-modal-continue", visible: true, wait: 8).click
    end
  end

  def section_selector(index) = ".lesson-section[data-section-index='#{index}']"
  def modal_selector(index) = ".quiz-modal-backdrop[data-section-index='#{index}']"

  # Measured, not inferred from `style`: a section is "shown" when it has a box.
  def shown_section_indexes
    page.evaluate_script(<<~JS)
      [...document.querySelectorAll(".lesson-section")]
        .filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => Number(el.dataset.sectionIndex))
    JS
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
