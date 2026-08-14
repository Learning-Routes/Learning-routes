require "test_helper"

# §A. WP-10 made five block types gate the step server-side, but the client only ever
# locked navigation for `check` (interactive_lesson_controller.js:371,
# `this._locked = isCheck && !isAnswered`), so a student could press Continuar straight
# past an untouched drag_drop, fill_blank, scenario or flashcards.
#
# The lock now reads data-gating / data-block-satisfied, which the SERVER renders from
# BlockGrader::GATING_TYPES and BlockAttempt. These tests pin what the server publishes,
# because that is the contract the JS depends on.
class LearningRoutesEngine::BlockNavigationGateTest < ActionDispatch::IntegrationTest
  BA = LearningRoutesEngine::BlockAttempt

  SECTIONS = [
    { "type" => "concept", "body" => "..." },                                            # 0 not gating
    # Real parser shape: pairs are {term:, definition:} hashes, not tuples. The partial
    # reads pair[:term] / pair[:definition]; a tuple raises in the view.
    { "type" => "drag_drop", "title" => "Match",
      "pairs" => [{ "term" => "a", "definition" => "1" },
                  { "term" => "b", "definition" => "2" }] },                             # 1 gating
    { "type" => "fill_blank", "title" => "Complete", "sentence" => "x ___", "blanks" => ["si"] }, # 2 gating
    { "type" => "visual", "title" => "V", "body" => "..." }                               # 3 not gating
  ].freeze

  def setup
    @user = Core::User.create!(
      name: "Nav", email: "nav-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "T", locale: "en", status: :active
    )
    # content_type "lesson": _step_content_frame only renders the lesson partial — and
    # therefore .lesson-section — for lesson/exercise steps. A "review" step renders a
    # different partial entirely, which is what made the first version of this test
    # assert against a page that had no sections at all.
    @step = @route.route_steps.create!(
      title: "S", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1, bloom_level: 1,
      metadata: { "parsed_sections" => SECTIONS.map(&:dup), "content_ready" => true }
    )
    @next_step = @route.route_steps.create!(
      title: "S2", position: 1, status: :locked, content_type: "review",
      delivery_format: "text", level: 1, bloom_level: 1, prerequisites: [@step.id]
    )
    ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: "## Concepto: x\nbody")

    # Completion is measured on a `review` step: lesson steps also carry the pre-existing
    # step-quiz gate, which would mask whether the BLOCK gate is what refused.
    @review_step = @route.route_steps.create!(
      title: "R", position: 2, status: :available, content_type: "review",
      delivery_format: "text", level: 1, bloom_level: 1,
      metadata: { "parsed_sections" => SECTIONS.map(&:dup), "content_ready" => true }
    )
    @after_review = @route.route_steps.create!(
      title: "R2", position: 3, status: :locked, content_type: "review",
      delivery_format: "text", level: 1, bloom_level: 1, prerequisites: [@review_step.id]
    )
    post "/sign_in", params: { email: @user.email, password: "password123" }
  end

  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  def show_page
    get learning_routes_engine.route_step_path(@route, @step)
    response.body
  end

  # Parse the real markup rather than pattern-matching a string — attribute order and
  # whitespace are the view's business, not this test's.
  def sections(body)
    nodes = Nokogiri::HTML(body).css(".lesson-section")
    assert nodes.any?, "the lesson rendered no sections — the page is not what this test thinks it is"
    nodes
  end

  def gating_flags(body)
    sections(body).to_h { |n| [n["data-section-index"].to_i, n["data-gating"] == "true"] }
  end

  def satisfied_flags(body)
    sections(body).to_h { |n| [n["data-section-index"].to_i, n["data-block-satisfied"] == "true"] }
  end

  test "the page publishes which sections gate navigation" do
    flags = gating_flags(show_page)

    assert_equal false, flags[0], "concept must not gate"
    assert_equal true,  flags[1], "drag_drop gates — it never locked navigation before"
    assert_equal true,  flags[2], "fill_blank gates — it never locked navigation before"
    assert_equal false, flags[3], "visual must not gate"
  end

  test "gating comes from BlockGrader, not a list in the view" do
    # If someone adds a type to GATING_TYPES the page must follow without another edit.
    LearningRoutesEngine::BlockGrader::GATING_TYPES.each do |type|
      assert LearningRoutesEngine::BlockGrader.gating?(type)
    end
    assert_not LearningRoutesEngine::BlockGrader.gating?("concept")
    assert_not LearningRoutesEngine::BlockGrader.gating?("visual")
  end

  test "an untouched gating section is published as unsatisfied" do
    flags = satisfied_flags(show_page)

    assert_equal false, flags[1]
    assert_equal false, flags[2]
  end

  test "a passed block is published as satisfied so navigation unlocks" do
    post learning_routes_engine.route_step_block_attempt_path(@route, @step, 1),
         params: { block: { matches: { "0" => "0", "1" => "1" } } }, as: :json
    assert_equal true, BA.find_by(user: @user, route_step: @step, section_index: 1).correct

    assert_equal true, satisfied_flags(show_page)[1]
  end

  test "a RELEASED block is published as satisfied even though it is not correct" do
    # The load-bearing WP-10 distinction: navigation follows `satisfied`, never `correct`.
    3.times do
      post learning_routes_engine.route_step_block_attempt_path(@route, @step, 1),
           params: { block: { matches: { "0" => "1", "1" => "0" } } }, as: :json
    end

    attempt = BA.find_by(user: @user, route_step: @step, section_index: 1)
    assert attempt.released?
    assert_equal false, attempt.correct

    assert_equal true, satisfied_flags(show_page)[1],
      "a released block must unlock navigation despite correct = false"
  end

  test "a wrong-but-not-yet-released block stays unsatisfied" do
    post learning_routes_engine.route_step_block_attempt_path(@route, @step, 1),
         params: { block: { matches: { "0" => "1", "1" => "0" } } }, as: :json

    assert_equal false, satisfied_flags(show_page)[1]
  end

  # ── The server half must not regress ────────────────────────────────────

  test "the server still refuses complete while a gating block is outstanding" do
    post learning_routes_engine.complete_route_step_path(@route, @review_step), as: :json

    assert_response :unprocessable_entity
    assert_equal [1, 2], response.parsed_body["sections"]
    assert_not @review_step.reload.completed?
    assert_equal "locked", @after_review.reload.status
  end

  test "a student who bypasses the JS is still stopped by the server" do
    # Satisfy only one of the two gating blocks, then post complete directly.
    post learning_routes_engine.route_step_block_attempt_path(@route, @review_step, 1),
         params: { block: { matches: { "0" => "0", "1" => "1" } } }, as: :json

    post learning_routes_engine.complete_route_step_path(@route, @review_step), as: :json

    assert_response :unprocessable_entity
    assert_equal [2], response.parsed_body["sections"]
  end

  test "satisfying every gating block lets the step complete and unlocks the next" do
    post learning_routes_engine.route_step_block_attempt_path(@route, @review_step, 1),
         params: { block: { matches: { "0" => "0", "1" => "1" } } }, as: :json
    post learning_routes_engine.route_step_block_attempt_path(@route, @review_step, 2),
         params: { block: { answers: ["si"] } }, as: :json

    post learning_routes_engine.complete_route_step_path(@route, @review_step), as: :json

    assert_response :success
    assert @review_step.reload.completed?
    assert_equal "available", @after_review.reload.status
  end
end
