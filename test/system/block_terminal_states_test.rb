require "application_system_test_case"

# THE CLASS: a gating block must never reach a terminal state without telling the
# server.
#
# Not "the timer does not submit". The shape is broader and has now produced two
# separate production blockers:
#
#   WP-22  the check modal lost its submission URL when WP-21 moved it out of
#          its section, so answering POSTed nothing.
#   WP-24  the quiz timer ended the block client-side — `_answered = true`, every
#          option `pointerEvents: none`, `quiz:completed` dispatched — and never
#          submitted, because the only submitter fires on a click the student
#          could no longer make.
#
# Both are the same split: the CLIENT believes the block is done, the SERVER was
# never told. `outstanding_blocks_for` reads BlockAttempt rows, so a block that
# ends without one can never clear its gate, and WP-22's `_showOutstandingBlocks`
# faithfully returns the student to it. Forever.
#
# Every assertion here is a database row. The DOM is what lied both times.
class BlockTerminalStatesTest < ApplicationSystemTestCase
  BA = LearningRoutesEngine::BlockAttempt
  GATING = LearningRoutesEngine::BlockGrader::GATING_TYPES

  CHECK_INDEX = 1

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

  SECTIONS = [
    { "type" => "concept", "title" => "Intro", "body" => "Cuerpo." },
    CHECK,
    { "type" => "tip", "title" => "Consejo", "body" => "Un consejo." }
  ].freeze

  def setup
    @user = Core::User.create!(
      name: "Terminal", email: "terminal-#{SecureRandom.hex(4)}@example.com",
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
  end

  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  # ── the three ways a check can end ──────────────────────────────────────

  test "a correct answer records a satisfied attempt" do
    open_lesson
    advance_to_check
    choose("please")

    attempt = wait_for_attempt(CHECK_INDEX)
    assert attempt, "a correct answer must reach the server"
    assert_not_nil attempt.completed_at
    assert_equal true, attempt.correct
  end

  # A wrong answer REACHES the server but does not satisfy: `BlockAttemptRecorder`
  # sets `completed_at` only when the answer is correct, or after
  # `BlockAttempt::RELEASE_AFTER` failures. That is WP-10 policy and is left alone.
  test "a wrong answer reaches the server and counts one attempt" do
    open_lesson
    advance_to_check
    choose("sorry")

    attempt = wait_for_attempt(CHECK_INDEX)
    assert attempt, "a wrong answer must reach the server — it still ends the block"
    assert_equal false, attempt.correct
    assert_equal 1, attempt.attempts
    assert_nil attempt.completed_at, "one wrong answer does not satisfy the gate"
  end

  # THE RED ONE. The timer ends the block and kills every option, so the click
  # path that submits can never run again. Before the fix this records nothing at
  # all and the step becomes impossible to complete for anyone who lets one timer
  # expire once.
  test "a timed-out check reaches the server and counts one attempt" do
    open_lesson
    shorten_quiz_timer_to_one_second
    advance_to_check

    attempt = wait_for_attempt(CHECK_INDEX, timeout: 15)

    assert attempt,
      "the timer expired and the server was never told: no BlockAttempt, so " \
      "outstanding_blocks_for can never clear this check and the step is unfinishable"
    assert_equal false, attempt.correct
    assert_equal 1, attempt.attempts,
      "a timeout is an outcome and must count toward RELEASE_AFTER"
  end

  # The gate is the thing that traps, so assert the gate, not just the row.
  #
  # Three timeouts, each a fresh visit — which is exactly what a returning
  # student does — must reach RELEASE_AFTER and un-trap them. Before the fix the
  # count never moved off zero, so the release was unreachable no matter how many
  # times they came back.
  test "repeated timeouts reach RELEASE_AFTER and clear the blocks gate" do
    LearningRoutesEngine::BlockAttempt::RELEASE_AFTER.times do |i|
      open_lesson
      shorten_quiz_timer_to_one_second
      advance_to_check
      assert wait_for_attempts(CHECK_INDEX, count: i + 1, timeout: 15),
        "timeout ##{i + 1} did not record; the student can never reach the release"
    end

    assert_empty @step.reload.outstanding_blocks_for(@user),
      "BlockAttempt::RELEASE_AFTER exists so a student who cannot get it right is " \
      "not trapped; a timeout that records nothing bypasses that release entirely"
  end

  # The retry itself: a check the student is sent back to must be answerable.
  test "a check returned to after a timeout is answerable again" do
    open_lesson
    shorten_quiz_timer_to_one_second
    advance_to_check
    assert wait_for_attempt(CHECK_INDEX, timeout: 15)

    open_lesson
    advance_to_check

    assert_equal "",
      page.evaluate_script(
        "document.querySelector(\".quiz-modal-backdrop[data-section-index='#{CHECK_INDEX}'] " \
        ".lesson-check__option\").style.pointerEvents"
      ),
      "the options were left dead after the timeout, so the student can never retry"

    choose("please")
    attempt = wait_for_attempts(CHECK_INDEX, count: 2, timeout: 10)
    assert attempt, "the retry must reach the server"
    assert_not_nil attempt.completed_at, "answering correctly on the retry satisfies the gate"
  end

  test "the timeout submits exactly once, not once per controller" do
    open_lesson
    shorten_quiz_timer_to_one_second
    advance_to_check
    assert wait_for_attempt(CHECK_INDEX, timeout: 15)

    assert_equal 1, BA.where(user: @user, route_step: @step, section_index: CHECK_INDEX).count,
      "lesson-check is the only submitter; lesson-quiz owns the timer and must not POST"
  end

  # ── the class, for the types this test does not drive ───────────────────

  # Driving all five gating types through every terminal state in a browser is a
  # matrix this file does not attempt, and pretending otherwise would be worse
  # than saying so. What it CAN pin cheaply is the precondition every one of them
  # needs: a controller that cannot reach `submitBlock` cannot possibly tell the
  # server anything.
  test "every gating block type has a controller that can submit" do
    controllers = {
      "check" => "lesson_check_controller.js",
      "drag_drop" => "drag_drop_controller.js",
      "fill_blank" => "fill_blank_controller.js",
      "flashcards" => "flashcards_controller.js",
      "scenario" => "scenario_controller.js"
    }

    assert_equal GATING.sort, controllers.keys.sort,
      "a gating type was added or removed; give it a row here and drive its " \
      "terminal states, or it can end without the server ever knowing"

    controllers.each do |type, file|
      path = Rails.root.join("app/javascript/controllers", file)
      assert path.exist?, "#{type} gates completion but #{file} does not exist"
      assert_match(/submitBlock/, path.read,
        "#{type} gates completion but #{file} never calls submitBlock — it can " \
        "reach a terminal state the server never hears about")
    end
  end

  private

  def open_lesson
    visit learning_routes_engine.route_step_path(@route, @step)
    assert_selector "[data-interactive-lesson-target='sectionsContainer']", wait: 10
  end

  # The timer is 15s in the partial. Shrink it before the modal opens — Stimulus
  # values are read live, and `_startTimer` reads `timerSecondsValue` when the
  # section is activated — so CI does not wait a quarter of a minute.
  def shorten_quiz_timer_to_one_second
    page.execute_script(<<~JS)
      document
        .querySelectorAll("[data-lesson-quiz-timer-seconds-value]")
        .forEach((el) => el.setAttribute("data-lesson-quiz-timer-seconds-value", "1"))
    JS
  end

  def advance_to_check
    find("[data-interactive-lesson-target='continueBtn']").click
    assert_selector ".quiz-modal-backdrop[data-section-index='#{CHECK_INDEX}']", visible: true, wait: 8
  end

  def choose(label)
    within ".quiz-modal-backdrop[data-section-index='#{CHECK_INDEX}']" do
      find(".lesson-check__option", text: label, match: :prefer_exact).click
    end
  end

  def wait_for_attempts(index, count:, timeout: 8)
    deadline = Time.current + timeout
    loop do
      row = BA.find_by(user: @user, route_step: @step, section_index: index)
      return row if row && row.attempts.to_i >= count
      break if Time.current > deadline

      sleep 0.1
    end
    nil
  end

  def wait_for_attempt(index, timeout: 8)
    # `sleep` is not politeness here: Puma runs in a thread of THIS process during
    # a system test, so a busy loop starves the very server the browser is
    # waiting on and the row can never appear.
    deadline = Time.current + timeout
    loop do
      row = BA.find_by(user: @user, route_step: @step, section_index: index)
      return row if row
      break if Time.current > deadline

      sleep 0.1
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
