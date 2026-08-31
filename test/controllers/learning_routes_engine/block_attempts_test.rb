require "test_helper"

# WP-10. Before this package the seven interactive block controllers made ZERO server
# requests between them: results lived in JS variables and died on reload, FSRS never saw
# a flashcard rating, and a student could skip every exercise and still finish the step.
class LearningRoutesEngine::BlockAttemptsTest < ActionDispatch::IntegrationTest
  BA = LearningRoutesEngine::BlockAttempt
  SR = LearningRoutesEngine::SpacedRepetition

  # A step whose parsed content contains one of each interesting block type.
  SECTIONS = [
    { "type" => "concept", "title" => "Intro", "body" => "..." },                       # 0 — never gates
    { "type" => "check", "question" => "¿Bom dia?",
      "options" => [{ "label" => "Buenos días", "correct" => true },
                    { "label" => "Buenas noches", "correct" => false }] },              # 1
    { "type" => "drag_drop", "title" => "Match",
      "pairs" => [%w[hola hello], %w[gracias thanks]] },                                # 2
    { "type" => "fill_blank", "title" => "Complete",
      "sentence" => "Bom ___", "blanks" => ["dia"] },                                   # 3
    { "type" => "flashcards", "title" => "Cards",
      "cards" => [{ "front" => "obrigado", "back" => "gracias" }] },                    # 4
    { "type" => "scenario", "title" => "Choose",
      "situation" => "s", "options" => [{ "label" => "A", "consequence" => "c" }] },    # 5
    { "type" => "simulation", "title" => "Sim", "variables" => [], "formula" => "x" },  # 6
    { "type" => "code_playground", "title" => "Play", "language" => "python",
      "code" => "print(1)", "expected_output" => "1" }                                  # 7
  ].freeze

  def setup
    @user = Core::User.create!(
      name: "Blocks", email: "blk-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "Portugués", locale: "es", status: :active
    )
    @step = @route.route_steps.create!(
      title: "Saludos", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1, bloom_level: 1,
      metadata: { "parsed_sections" => SECTIONS.map(&:dup) }
    )
    @next_step = @route.route_steps.create!(
      title: "Siguiente", position: 1, status: :locked, content_type: "lesson",
      delivery_format: "text", level: 1, bloom_level: 1, prerequisites: [@step.id]
    )
    post "/sign_in", params: { email: @user.email, password: "password123" }
  end

  # Core::ApplicationController#set_locale assigns I18n.locale GLOBALLY with no reset, so
  # an integration request as a Spanish user leaves the process in :es and later model
  # tests get Spanish validation messages ("no puede estar en blanco"). These tests drive
  # Spanish users deliberately, so they clean up after themselves rather than adding to a
  # pre-existing leak. The general fix belongs in test_helper — see FINDINGS_WP10.md.
  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  def submit(section_index, payload, complete: true)
    post learning_routes_engine.route_step_block_attempt_path(@route, @step, section_index),
         params: { block: payload.merge(submission_complete: complete) }, as: :json
  end

  def attempt_for(section_index)
    BA.find_by(user: @user, route_step: @step, section_index: section_index)
  end

  # ── Per-type grading, persisted server-side ─────────────────────────────

  test "check is graded server-side and persisted" do
    submit(1, { option_index: 0 })

    assert_response :success
    a = attempt_for(1)
    assert_equal "check", a.block_type
    assert_equal true, a.correct
    assert_equal 100.0, a.score.to_f
    assert a.satisfied?
  end

  test "a wrong check is recorded as incorrect" do
    submit(1, { option_index: 1 })

    a = attempt_for(1)
    assert_equal false, a.correct
    assert_not a.satisfied?, "a wrong answer must not satisfy the gate"
  end

  test "drag_drop is graded against the stored pairs" do
    submit(2, { matches: { "0" => "0", "1" => "1" } })
    assert_equal true, attempt_for(2).correct

    submit(2, { matches: { "0" => "1", "1" => "0" } })
    assert_equal false, attempt_for(2).reload.correct
  end

  test "drag_drop partial credit is scored but not passed" do
    submit(2, { matches: { "0" => "0", "1" => "0" } })

    a = attempt_for(2)
    assert_equal false, a.correct
    assert_equal 50.0, a.score.to_f
  end

  test "fill_blank normalizes case and accents" do
    submit(3, { answers: ["DÍA"] })

    a = attempt_for(3)
    assert_equal true, a.correct, "'DÍA' should match 'dia' — case and accent insensitive"
  end

  test "flashcards record engagement and carry a rating, not a correctness" do
    submit(4, { ratings: { "0" => "hard" }, rated_count: 1 })

    a = attempt_for(4)
    assert_nil a.correct, "flashcards are self-reported, not correct/incorrect"
    assert a.satisfied?
    assert_equal SR::HARD, a.fsrs_rating
  end

  test "scenario, simulation and code_playground record engagement only" do
    submit(5, { option_index: 0 })
    submit(6, { interacted: true })
    submit(7, { ran: true })

    [5, 6, 7].each do |i|
      a = attempt_for(i)
      assert_not_nil a, "section #{i} produced no attempt"
      assert_nil a.correct, "section #{i} must not claim correctness"
      assert a.satisfied?, "section #{i} should record engagement"
      assert_nil a.fsrs_rating, "section #{i} carries no mastery signal"
    end
  end

  # ── §5: the client does not get a vote ──────────────────────────────────

  test "a falsified client submission is re-graded and rejected" do
    # The answer key is in the DOM, so a student can read it. What they cannot do is
    # tell the server they were right when they were not.
    post learning_routes_engine.route_step_block_attempt_path(@route, @step, 1),
         params: {
           block: {
             option_index: 1, correct: true, score: 100, passed: true,
             submission_complete: true
           }
         },
         as: :json

    a = attempt_for(1)
    assert_equal false, a.correct, "the server must re-grade, not trust the client's claim"
    assert_equal 0.0, a.score.to_f
    assert_not a.satisfied?
  end

  test "a forged flashcard correctness claim does not become a pass" do
    submit(4, { ratings: { "0" => "easy" }, correct: true, score: 100 })

    assert_nil attempt_for(4).correct
  end

  # ── The approved amendment: release after 3 failures ────────────────────

  test "incomplete interactions are stored and graded without consuming an attempt" do
    3.times { submit(2, { matches: { "0" => "1" } }, complete: false) }

    a = attempt_for(2)
    assert_equal 0, a.attempts
    assert_equal false, a.correct
    assert_equal({ "matches" => { "0" => "1" }, "submission_complete" => false }, a.payload)
    assert_not a.released?
    assert_not a.satisfied?

    assert_equal 3, response.parsed_body["attempts_remaining"]
  end

  test "only completed wrong answers consume the release counter" do
    7.times { submit(2, { matches: { "0" => "1" } }, complete: false) }
    2.times { submit(2, { matches: { "0" => "1", "1" => "0" } }, complete: true) }

    a = attempt_for(2)
    assert_equal 2, a.attempts
    assert_not a.released?

    submit(2, { matches: { "0" => "1", "1" => "0" } }, complete: true)
    assert_equal 3, a.reload.attempts
    assert a.released?
    assert_equal false, a.correct
  end

  test "a forged correctness claim is ignored even on a completed submission" do
    submit(1, { option_index: 1, correct: true, score: 100, passed: true }, complete: true)

    a = attempt_for(1)
    assert_equal 1, a.attempts
    assert_equal false, a.correct
    assert_not a.satisfied?
  end

  test "missing submission_complete is incomplete rather than legacy-complete" do
    post learning_routes_engine.route_step_block_attempt_path(@route, @step, 1),
         params: { block: { option_index: 1 } }, as: :json

    assert_response :success
    assert_equal 0, attempt_for(1).attempts
    assert_not attempt_for(1).released?
  end

  test "a correctness-gated block stops gating after three failures" do
    3.times { submit(1, { option_index: 1 }) }

    a = attempt_for(1)
    assert_equal 3, a.attempts
    assert a.released?, "should have been released after RELEASE_AFTER failures"
    assert a.satisfied?, "a released block must stop gating"
  end

  test "a released block is NOT recorded as a pass" do
    # The whole point of the separate column: a released block is a signal that the
    # answer key is probably wrong, and must never read as a success downstream.
    3.times { submit(1, { option_index: 1 }) }

    a = attempt_for(1)
    assert_equal false, a.correct, "released must not flip correct to true"
    assert_not a.passed?
    assert a.released?
    assert_nil a.fsrs_rating, "a released block must feed FSRS nothing at all"
  end

  test "two failures do not release" do
    2.times { submit(1, { option_index: 1 }) }

    a = attempt_for(1)
    assert_not a.released?
    assert_not a.satisfied?
  end

  test "retry stays open after release and a later correct answer still records" do
    3.times { submit(1, { option_index: 1 }) }
    submit(1, { option_index: 0 })

    a = attempt_for(1)
    assert_equal true, a.correct
    assert a.satisfied?
  end

  # ── Fail open on data quality ───────────────────────────────────────────

  test "a malformed gradable block is downgraded to engagement rather than trapping" do
    @step.update!(metadata: { "parsed_sections" => [{ "type" => "check", "options" => [] }] })

    submit(0, { option_index: 0 })

    a = attempt_for(0)
    assert_nil a.correct, "an ungradable section must not be scored"
    assert a.satisfied?, "the student must not be trapped by our generation bug"
  end

  # ── Ownership ───────────────────────────────────────────────────────────

  test "another user cannot submit against this step" do
    other = Core::User.create!(
      name: "Other", email: "oth-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )

    # A second `post "/sign_in"` on the same integration session does NOT reliably swap
    # the signed-in user — the first session survives and the request runs as the owner,
    # which makes this test pass for the wrong reason. Drive a genuinely separate session.
    as_other = open_session
    as_other.post "/sign_in", params: { email: other.email, password: "password123" }
    as_other.post learning_routes_engine.route_step_block_attempt_path(@route, @step, 1),
                  params: { block: { option_index: 0, submission_complete: true } }, as: :json

    assert_equal 403, as_other.response.status
    assert_nil BA.find_by(user: other, route_step: @step)
    assert_nil BA.find_by(user: @user, route_step: @step, section_index: 1),
      "the owner must not have an attempt created by someone else's request"
  end
end
