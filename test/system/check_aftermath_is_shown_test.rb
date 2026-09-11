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
    assert_settled_sections [CHECK_INDEX],
      "exactly one section may be on screen; the section the student was " \
      "reading before the modal stayed visible underneath"

    find("[data-interactive-lesson-target='continueBtn']").click

    assert_selector section_selector(2), visible: true, wait: 8
    assert_settled_sections [2]
  end

  test "a check without an aftermath is skipped, exactly as before" do
    open_lesson_with(CHECK)

    answer_the_check

    assert_selector section_selector(2), visible: true, wait: 8
    assert_settled_sections [2],
      "a check with nothing to show must not become a blank page the student " \
      "has to click through, and the section before it must not linger"
  end

  test "going back onto the check shows the aftermath again without reopening the modal" do
    open_lesson_with(CHECK.merge("aftermath" => AFTERMATH))

    answer_the_check
    # Settle before every click: `nextSection`/`previousSection` early-return
    # while `_animating`, which is only cleared in _transitionToSection's 400ms
    # timeout, so a click fired the instant the incoming section appears is
    # silently swallowed and the lesson never moves.
    assert_settled_sections [CHECK_INDEX]
    find("[data-interactive-lesson-target='continueBtn']").click
    assert_settled_sections [2]

    find("[data-interactive-lesson-target='backBtn']").click

    assert_selector section_selector(CHECK_INDEX), visible: true, wait: 8
    within(section_selector(CHECK_INDEX)) { assert_text "Mira el diagrama antes de seguir." }
    assert_no_selector modal_selector(CHECK_INDEX), visible: true
    assert_settled_sections [CHECK_INDEX]
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

  # `_transitionToSection` reveals the incoming section SYNCHRONOUSLY and hides
  # the outgoing one in a 400ms setTimeout, so the set is legitimately
  # two-valued for the length of the crossfade. Measuring the instant the
  # incoming section appears raced that window and reported the section the
  # student had just left as still shown — which is also the exact symptom of
  # the defect this test exists to catch, so the two were indistinguishable.
  #
  # Poll for the condition instead. A section that is merely animating out
  # clears within the crossfade; a section that was never hidden never does.
  # Measured against fe06b73 (the base, before the fix): the unfixed case
  # stayed two-valued for all 12 samples over 1.8s, so the two are separable.
  def assert_settled_sections(expected, message = nil)
    deadline = Time.now + Capybara.default_max_wait_time
    actual = shown_section_indexes
    while actual != expected && Time.now < deadline
      sleep 0.05
      actual = shown_section_indexes
    end
    assert_equal expected, actual, message
  end

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
