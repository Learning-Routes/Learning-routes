require "application_system_test_case"

# A lesson with adjacent `check` sections must be completable ONLY after both are
# answered, and answering must reach the SERVER.
#
# WP-21 fixed a check modal that had no size, and its tests asserted the modal was
# visible, its options clickable, and the footer unlocked. All three passed while
# the answer never left the browser: the footer unlocks off the CLIENT flag
# `_locked = gates && !satisfied && !(isCheck && isAnswered)`, and `isAnswered` is
# set locally the moment an option is clicked. So the whole WP-21 suite was green
# on a lesson the server still refused to complete.
#
# The assertions here are deliberately server-side — a BlockAttempt row and the
# real `complete` response — because that is the only evidence the client cannot
# fake.
class LessonCompletionTest < ApplicationSystemTestCase
  BA = LearningRoutesEngine::BlockAttempt

  CHECK = {
    "type" => "check",
    "question" => "¿Cuál significa \"por favor\"?",
    "options" => [
      { "label" => "thank you", "correct" => false },
      { "label" => "please",    "correct" => true },
      { "label" => "sorry",     "correct" => false }
    ],
    "explanation" => "\"Por favor\" es \"please\"."
  }.freeze

  # The shape of the lesson that fails in production: a gating block, then two
  # adjacent checks, then non-gating tail sections.
  FLASHCARDS_INDEX = 1
  FIRST_CHECK  = 2
  SECOND_CHECK = 3

  SECTIONS = [
    { "type" => "concept", "title" => "Intro", "body" => "Cuerpo de la introducción." },
    { "type" => "flashcards", "title" => "Tarjetas",
      "cards" => [{ "front" => "AMI", "back" => "Plantilla" }] },
    CHECK,
    CHECK.merge("question" => "¿Y \"gracias\"?"),
    { "type" => "tip", "title" => "Consejo", "body" => "Un consejo." },
    { "type" => "summary", "title" => "Resumen", "body" => "Cierre.", "key_points" => ["Uno"] }
  ].freeze

  def setup
    @user = Core::User.create!(
      name: "Completion", email: "completion-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
    @step = @route.route_steps.create!(
      title: "Lección", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: :nv1, bloom_level: 1,
      metadata: { "parsed_sections" => SECTIONS.map(&:deep_dup), "content_ready" => true }
    )
    ContentEngine::AiContent.create!(
      route_step: @step, content_type: :text, body: "## Concepto: x\nbody"
    )

    sign_in_through_ui
    visit learning_routes_engine.route_step_path(@route, @step)
    assert_selector "[data-interactive-lesson-target='sectionsContainer']", wait: 10
  end

  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  # ── §B: the answer must reach the server ────────────────────────────────

  test "answering a check records a BlockAttempt on the server" do
    advance_to_first_check

    assert_operator modal_rect(FIRST_CHECK)["height"], :>, 0,
      "WP-21's guarantee: the modal has a size"

    answer_check(FIRST_CHECK)

    attempt = wait_for_attempt(FIRST_CHECK)
    assert attempt, "answering the check produced NO submission at all — the block " \
      "never reached /blocks/#{FIRST_CHECK}, so the gate can never be satisfied"
    assert_not_nil attempt.completed_at
    assert_equal "check", attempt.block_type
  end

  test "both adjacent checks record their own attempt" do
    advance_to_first_check
    answer_check(FIRST_CHECK)
    assert wait_for_attempt(FIRST_CHECK)

    dismiss_modal(FIRST_CHECK)
    assert_selector modal_selector(SECOND_CHECK), visible: true, wait: 8

    answer_check(SECOND_CHECK)
    assert wait_for_attempt(SECOND_CHECK),
      "the second adjacent check also has to reach the server"

    # All three GATING blocks in this lesson recorded: flashcards and both checks.
    assert_equal [FLASHCARDS_INDEX, FIRST_CHECK, SECOND_CHECK],
      BA.where(user: @user, route_step: @step).order(:section_index).pluck(:section_index)
  end

  # The whole point, stated as the SERVER's verdict — this is the exact refusal
  # seen in production: POST /complete -> 422 {"blocks_required":true,
  # "sections":[14,15]}.
  #
  # Asserted on `outstanding_blocks_for` rather than on `completed?`, because
  # every lesson step also passes through a separate mini-quiz gate
  # (`requires_quiz?` is true for content_type lesson), which is not §B and is
  # deliberately left alone.
  test "the blocks gate clears only after both checks are answered" do
    advance_to_first_check

    outstanding = @step.reload.outstanding_blocks_for(@user).map { |b| b[:section_index] }
    assert_equal [FIRST_CHECK, SECOND_CHECK], outstanding,
      "both checks must be outstanding before they are answered, or this proves nothing"

    answer_check(FIRST_CHECK)
    assert wait_for_attempt(FIRST_CHECK)
    dismiss_modal(FIRST_CHECK)

    assert_selector modal_selector(SECOND_CHECK), visible: true, wait: 8
    assert_equal [SECOND_CHECK], @step.reload.outstanding_blocks_for(@user).map { |b| b[:section_index] },
      "answering the first check must clear exactly one gate"

    answer_check(SECOND_CHECK)
    assert wait_for_attempt(SECOND_CHECK)

    assert_empty @step.reload.outstanding_blocks_for(@user),
      "the server still refuses: it is these sections the 422 named in production"
  end

  private

  def modal_selector(index) = ".quiz-modal-backdrop[data-section-index='#{index}']"

  def modal_rect(index)
    page.evaluate_script(<<~JS)
      (() => {
        const el = document.querySelector("#{modal_selector(index)}")
        if (!el) return { width: -1, height: -1 }
        const r = el.getBoundingClientRect()
        return { width: r.width, height: r.height }
      })()
    JS
  end

  # Section 1 is `flashcards`, which GATES (BlockGrader::GATING_TYPES). It has to
  # be satisfied before the student can reach the checks at all.
  def advance_to_first_check
    find("[data-interactive-lesson-target='continueBtn']").click
    assert_selector "[data-controller='flashcards']", visible: true, wait: 8
    satisfy_flashcards
    find("[data-interactive-lesson-target='continueBtn']").click
    assert_selector modal_selector(FIRST_CHECK), visible: true, wait: 8
  end

  # Rating every card is what the flashcards block counts as completion — it
  # submits on `finishSession`, after the LAST card is rated (flashcards_controller
  # #rate -> nextCard -> finishSession).
  def satisfy_flashcards
    SECTIONS[FLASHCARDS_INDEX]["cards"].size.times do
      find("[data-action='click->flashcards#rate'][data-difficulty='easy']", visible: true, wait: 5).click
    end

    assert wait_for_attempt(FLASHCARDS_INDEX),
      "the flashcards block did not record — this test's precondition is broken, not §B"
  end

  def answer_check(index)
    within modal_selector(index) do
      find(".lesson-check__option", text: "please", match: :prefer_exact).click
    end
  end

  def dismiss_modal(index)
    within modal_selector(index) do
      find(".quiz-modal-continue", visible: true, wait: 8).click
    end
  end

  def wait_for_attempt(index, timeout: 8)
    deadline = Time.current + timeout
    loop do
      row = BA.find_by(user: @user, route_step: @step, section_index: index)
      return row if row
      break if Time.current > deadline
    end
    nil
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
