require "test_helper"

# The progression half of WP-10: an unfinished block blocks the step, and finishing the
# step unlocks the next one through the EXISTING RouteProgressTracker path rather than a
# second mechanism.
class LearningRoutesEngine::BlockGatingTest < ActionDispatch::IntegrationTest
  BA = LearningRoutesEngine::BlockAttempt
  SR = LearningRoutesEngine::SpacedRepetition

  def setup
    @user = Core::User.create!(
      name: "Gate", email: "gate-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "Portugués", locale: "es", status: :active
    )
    # content_type "review" so requires_quiz? is false and the BLOCK gate is what we
    # are actually measuring, not the pre-existing quiz gate.
    @step = @route.route_steps.create!(
      title: "Uno", position: 0, status: :available, content_type: "review",
      delivery_format: "text", level: 1, bloom_level: 1,
      metadata: { "parsed_sections" => [
        { "type" => "concept", "body" => "..." },
        { "type" => "check", "question" => "q",
          "options" => [{ "label" => "si", "correct" => true }, { "label" => "no", "correct" => false }] }
      ] }
    )
    @next_step = @route.route_steps.create!(
      title: "Dos", position: 1, status: :locked, content_type: "review",
      delivery_format: "text", level: 1, bloom_level: 1, prerequisites: [@step.id]
    )
    post "/sign_in", params: { email: @user.email, password: "password123" }
  end

  def complete_step
    post learning_routes_engine.complete_route_step_path(@route, @step), as: :json
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

  def submit_check(option_index)
    post learning_routes_engine.route_step_block_attempt_path(@route, @step, 1),
         params: { block: { option_index: option_index, submission_complete: true } }, as: :json
  end

  test "a step with an unfinished gating block cannot be completed" do
    complete_step

    assert_response :unprocessable_entity
    assert_equal [1], response.parsed_body["sections"]
    assert_not @step.reload.completed?
    assert_equal "locked", @next_step.reload.status, "the next step must stay locked"
  end

  test "a concept-only step is not gated" do
    @step.update!(metadata: { "parsed_sections" => [{ "type" => "concept", "body" => "..." }] })

    complete_step

    assert_response :success
    assert @step.reload.completed?
  end

  test "completing the block unlocks the next step through RouteProgressTracker" do
    submit_check(0)
    assert BA.find_by(user: @user, route_step: @step, section_index: 1).satisfied?

    complete_step

    assert_response :success
    assert @step.reload.completed?
    assert_equal "available", @next_step.reload.status,
      "the existing tracker path should have unlocked the next step"
  end

  test "a wrong answer keeps the step blocked" do
    submit_check(1)

    complete_step

    assert_response :unprocessable_entity
    assert_not @step.reload.completed?
  end

  test "a released block unblocks the step without claiming a pass" do
    3.times { submit_check(1) }

    complete_step

    assert_response :success
    assert @step.reload.completed?, "a released block must not trap the student"
    assert_equal false, BA.find_by(user: @user, route_step: @step, section_index: 1).correct,
      "and it must still be recorded as not correct"
  end

  # ── FSRS ────────────────────────────────────────────────────────────────

  test "a flashcard rating reaches SpacedRepetition" do
    @step.update!(metadata: { "parsed_sections" => [
      { "type" => "flashcards", "cards" => [{ "front" => "a", "back" => "b" }] }
    ] })

    before_reps = @step.fsrs_reps.to_i

    post learning_routes_engine.route_step_block_attempt_path(@route, @step, 0),
         params: {
           block: { ratings: { "0" => "hard" }, rated_count: 1, submission_complete: true }
         }, as: :json

    @step.reload
    assert_operator @step.fsrs_reps.to_i, :>, before_reps,
      "the rating should have driven an FSRS review on the step"
    assert_not_nil @step.fsrs_next_review_at
    assert_not_nil @step.fsrs_stability
  end

  test "the step's FSRS rating is the worst across its blocks, not the average" do
    @step.update!(metadata: { "parsed_sections" => [
      { "type" => "check", "question" => "q",
        "options" => [{ "label" => "si", "correct" => true }, { "label" => "no", "correct" => false }] }
    ] })

    # Correct, but only after two wrong tries -> HARD, not GOOD.
    post learning_routes_engine.route_step_block_attempt_path(@route, @step, 0),
         params: { block: { option_index: 1, submission_complete: true } }, as: :json
    post learning_routes_engine.route_step_block_attempt_path(@route, @step, 0),
         params: { block: { option_index: 0, submission_complete: true } }, as: :json

    attempt = BA.find_by(user: @user, route_step: @step, section_index: 0)
    assert_equal SR::HARD, attempt.fsrs_rating,
      "correct after a wrong attempt is HARD, which is what should schedule the step"
  end

  test "a released attempt contributes nothing to FSRS" do
    3.times { submit_check(1) }

    attempt = BA.find_by(user: @user, route_step: @step, section_index: 1)
    assert attempt.released?
    assert_nil attempt.fsrs_rating,
      "feeding a released block to FSRS would poison the data this package exists to produce"
  end
end
