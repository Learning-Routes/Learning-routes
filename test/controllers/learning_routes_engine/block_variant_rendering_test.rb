require "test_helper"

# WP-15 §A2 + §B. Before this package the terms column was `pairs.shuffle` re-indexed by
# its NEW position while the definitions column kept the stored order, so the client was
# told that whatever term landed on row i belonged to the definition on row i. The
# shuffle erased itself: the answer was always "the one beside it", AND the block put a
# green border on pairings that were wrong.
#
# These tests read the indices out of the REAL rendered page and submit exactly what the
# JS would build from them. That is the test A2 would have failed.
class LearningRoutesEngine::BlockVariantRenderingTest < ActionDispatch::IntegrationTest
  BA = LearningRoutesEngine::BlockAttempt
  BV = LearningRoutesEngine::BlockVariant

  PAIRS = [
    { "term" => "Instancia",          "definition" => "Computadora virtual que ejecutas en AWS" },
    { "term" => "Tipo de instancia",  "definition" => "La combinación de CPU y memoria que eliges" },
    { "term" => "AMI",                "definition" => "La plantilla de la que arranca una instancia" },
    { "term" => "Región",             "definition" => "El área geográfica donde vive el recurso" },
    { "term" => "Zona de disponibilidad", "definition" => "Un centro de datos aislado dentro de una región" },
    { "term" => "Grupo de seguridad", "definition" => "El cortafuegos virtual de una instancia" },
    { "term" => "Par de claves",      "definition" => "Las credenciales con las que te conectas" },
    { "term" => "Volumen EBS",        "definition" => "El disco que sobrevive al apagado" }
  ].freeze

  OPTIONS = [
    { "label" => "La primera",  "correct" => true },
    { "label" => "La segunda",  "correct" => false },
    { "label" => "La tercera",  "correct" => false },
    { "label" => "La cuarta",   "correct" => false },
    { "label" => "La quinta",   "correct" => false },
    { "label" => "La sexta",    "correct" => false }
  ].freeze

  DRAG_DROP_INDEX = 1
  CHECK_INDEX     = 2

  SECTIONS = [
    { "type" => "concept", "title" => "Intro", "body" => "..." },                     # 0
    { "type" => "drag_drop", "title" => "Empareja", "pairs" => PAIRS },               # 1
    { "type" => "check", "question" => "¿Cuál?", "options" => OPTIONS }               # 2
  ].freeze

  def setup
    @user = Core::User.create!(
      name: "Var", email: "var-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "AWS", locale: "es", status: :active
    )
    @step = @route.route_steps.create!(
      title: "EC2", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1, bloom_level: 1,
      metadata: { "parsed_sections" => SECTIONS.map(&:deep_dup), "content_ready" => true }
    )
    ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: "## Concepto: x\nbody")
    post "/sign_in", params: { email: @user.email, password: "password123" }
  end

  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  def page
    get learning_routes_engine.route_step_path(@route, @step)
    assert_response :success
    Nokogiri::HTML(response.body)
  end

  def submit(section_index, payload)
    post learning_routes_engine.route_step_block_attempt_path(@route, @step, section_index),
         params: { block: { submission_complete: true }.merge(payload) }, as: :json
  end

  def attempt_for(section_index)
    BA.find_by(user: @user, route_step: @step, section_index: section_index)
  end

  def variant(attempt_number:, section_index:)
    BV.for(user: @user, route_step: @step, section_index: section_index, attempt_number: attempt_number)
  end

  # ── §A2: the rendered indices are faithful to the stored pairs ──────────

  test "each rendered term carries its ORIGINAL index and the definition it truly belongs to" do
    doc = page
    terms = doc.css("[data-drag-drop-target='term']")
    zones = doc.css("[data-drag-drop-target='dropZone']")

    assert_equal PAIRS.size, terms.size
    assert_equal PAIRS.size, zones.size

    terms.each do |node|
      original = node["data-term-index"].to_i
      assert_equal PAIRS[original]["term"], node.text.strip,
                   "the element at data-term-index=#{original} is not the term stored there"
      assert_equal original.to_s, node["data-correct-def"],
                   "data-correct-def must be the term's own index — that is what grade_drag_drop compares"
    end

    zones.each do |node|
      original = node["data-def-index"].to_i
      assert_includes node.text, PAIRS[original]["definition"],
                      "the drop zone at data-def-index=#{original} is not the definition stored there"
    end
  end

  test "the two columns are permuted independently, so the answer is not the one beside it" do
    doc = page
    term_order = doc.css("[data-drag-drop-target='term']").map { |n| n["data-term-index"].to_i }
    def_order  = doc.css("[data-drag-drop-target='dropZone']").map { |n| n["data-def-index"].to_i }

    assert_equal variant(attempt_number: 0, section_index: DRAG_DROP_INDEX).order(PAIRS.size, salt: "terms"),
                 term_order
    assert_equal variant(attempt_number: 0, section_index: DRAG_DROP_INDEX).order(PAIRS.size, salt: "definitions"),
                 def_order
    assert_not_equal term_order, def_order,
                     "both columns moved together — the positional shortcut survives"
  end

  test "the board is identical on a reload and different after a failure" do
    first  = page.css("[data-drag-drop-target='term']").map { |n| n["data-term-index"] }
    reload = page.css("[data-drag-drop-target='term']").map { |n| n["data-term-index"] }
    assert_equal first, reload, "a reload mid-exercise must not scramble the board"

    submit(DRAG_DROP_INDEX, { matches: { "0" => "1" } })   # a failure — attempts becomes 1
    assert_equal 1, attempt_for(DRAG_DROP_INDEX).attempts

    assert_not_equal first, page.css("[data-drag-drop-target='term']").map { |n| n["data-term-index"] },
                     "retrying must not be muscle memory"
  end

  test "two students do not share a board" do
    mine = page.css("[data-drag-drop-target='term']").map { |n| n["data-term-index"] }

    other = Core::User.create!(
      name: "Otro", email: "otro-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    other_profile = LearningRoutesEngine::LearningProfile.create!(user: other, current_level: "beginner")
    other_route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: other_profile, topic: "AWS", locale: "es", status: :active
    )
    other_step = other_route.route_steps.create!(
      title: "EC2", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1, bloom_level: 1,
      metadata: { "parsed_sections" => SECTIONS.map(&:deep_dup), "content_ready" => true }
    )
    ContentEngine::AiContent.create!(route_step: other_step, content_type: :text, body: "## Concepto: x\nbody")

    delete "/sign_out"
    post "/sign_in", params: { email: other.email, password: "password123" }
    get learning_routes_engine.route_step_path(other_route, other_step)
    theirs = Nokogiri::HTML(response.body).css("[data-drag-drop-target='term']").map { |n| n["data-term-index"] }

    assert_not_equal mine, theirs
  end

  # ── §A1: a submission built from the rendered DOM actually grades ───────

  test "a submission built from the rendered DOM indices grades CORRECT" do
    doc = page

    # Exactly what drag_drop_controller builds: for each term the student drops it on the
    # zone whose data-def-index equals the term's data-correct-def, and _submitMatches
    # sends {term_index => placed_def_index}.
    matches = doc.css("[data-drag-drop-target='term']").to_h do |node|
      [node["data-term-index"], node["data-correct-def"]]
    end

    submit(DRAG_DROP_INDEX, { matches: matches })
    assert_response :success

    attempt = attempt_for(DRAG_DROP_INDEX)
    assert_equal true, attempt.correct, "the pairing the page itself calls correct did not grade correct"
    assert_equal 100.0, attempt.score.to_f
    assert attempt.satisfied?
  end

  test "a deliberately mismatched submission grades INCORRECT" do
    doc = page
    term_indices = doc.css("[data-drag-drop-target='term']").map { |n| n["data-term-index"] }

    # Rotate: every term is placed on somebody else's definition.
    mismatched = term_indices.each_with_index.to_h do |term_index, i|
      [term_index, term_indices[(i + 1) % term_indices.size]]
    end

    submit(DRAG_DROP_INDEX, { matches: mismatched })
    assert_response :success

    attempt = attempt_for(DRAG_DROP_INDEX)
    assert_equal false, attempt.correct
    assert_equal 0.0, attempt.score.to_f
    assert_not attempt.satisfied?
  end

  # This is the assertion that pins the WHOLE point of A2: a submission that matches by
  # SCREEN POSITION — row 1 with row 1 — must now be wrong, because the columns moved
  # independently. Under the old partial this was the guaranteed-correct answer.
  test "matching row-for-row by screen position no longer grades correct" do
    doc = page
    term_order = doc.css("[data-drag-drop-target='term']").map { |n| n["data-term-index"] }
    def_order  = doc.css("[data-drag-drop-target='dropZone']").map { |n| n["data-def-index"] }

    by_position = term_order.each_with_index.to_h { |term_index, row| [term_index, def_order[row]] }

    submit(DRAG_DROP_INDEX, { matches: by_position })
    assert_equal false, attempt_for(DRAG_DROP_INDEX).correct
  end

  # ── §A3: a wrong placement is recorded, and the valve is reachable ──────

  test "three failed submissions release the block without ever claiming it was correct" do
    3.times { submit(DRAG_DROP_INDEX, { matches: { "0" => "1" } }) }

    attempt = attempt_for(DRAG_DROP_INDEX)
    assert_equal 3, attempt.attempts, "a wrong placement must increment attempts or the valve can never fire"
    assert attempt.released?, "RELEASE_AFTER never fired — a student facing a bad answer key is trapped"
    assert_equal false, attempt.correct, "released is NOT a pass"
    assert attempt.satisfied?, "a released block must still satisfy navigation"
  end

  test "the released block is published to the client as satisfied" do
    3.times { submit(DRAG_DROP_INDEX, { matches: { "0" => "1" } }) }

    node = page.css(".lesson-section[data-section-index='#{DRAG_DROP_INDEX}']").first
    assert_equal "true", node["data-gating"]
    assert_equal "true", node["data-block-satisfied"]
  end

  test "the release response tells the client it is satisfied but not correct" do
    2.times { submit(DRAG_DROP_INDEX, { matches: { "0" => "1" } }) }
    submit(DRAG_DROP_INDEX, { matches: { "0" => "1" } })

    body = JSON.parse(response.body)
    assert_equal false, body["correct"]
    assert_equal true,  body["released"]
    assert_equal true,  body["satisfied"]
    assert_equal 0,     body["attempts_remaining"]
  end

  # ── §C/§D: the page geometry the measurements were taken against ───────

  # These four reserves each existed for the same fixed footer, and the measured dead
  # region between the lesson body and the likes bar was 325px because of it. A Rails
  # test cannot measure pixels, but it can pin the structure the browser measurement
  # was taken against, so a later edit cannot quietly put the reserves back.
  test "the step page reserves the fixed footer once and declares one reading measure" do
    doc = page

    assert doc.css(".step-page").any?, "the page wrapper carries the geometry"
    assert doc.css(".step-page-layout").any?
    assert doc.css(".lesson-nav-footer-inner").any?,
           "the fixed footer mirrors the page grid so its button sits under the reading column"

    assert_empty doc.css('[id^="ai_supplementary_"][style*="margin"]'),
                 "the empty AI slot must not carry an unconditional inline margin"

    # The four literals the WP-15 §C/§D measurement identified, by name.
    body = response.body
    assert_not_includes body, "max-width:82rem",     "the row no longer claims width it cannot use"
    assert_not_includes body, "max-width:50rem",     "the column width comes from --step-measure"
    assert_not_includes body, "padding:0 1rem 6rem", "the second footer reserve is gone"
    assert_not_includes body, "max-width:48rem",     "the lesson body no longer sets its own measure"
  end

  test "the sidebar renders the step facts as a list rather than four identical pills" do
    rows = page.css(".step-info-row")

    assert_operator rows.size, :>=, 2
    rows.each do |row|
      assert row.at_css(".step-info-label"), "every row names its fact"
      assert row.at_css(".step-info-value"), "every row carries its value"
    end
  end

  # ── §B: check ──────────────────────────────────────────────────────────

  test "check renders its options permuted while keeping the original index" do
    doc = page
    buttons = doc.css("button[data-option-index]")

    assert_equal OPTIONS.size, buttons.size
    assert_equal variant(attempt_number: 0, section_index: CHECK_INDEX).order(OPTIONS.size, salt: "options"),
                 buttons.map { |b| b["data-option-index"].to_i }

    buttons.each do |b|
      original = b["data-option-index"].to_i
      assert_includes b.text, OPTIONS[original]["label"],
                      "the button at data-option-index=#{original} is not the option stored there"
    end
  end

  test "check still grades against the ORIGINAL index after permutation" do
    doc = page

    correct_button = doc.css("button[data-option-index]").find { |b| b["data-correct"] == "true" }
    submit(CHECK_INDEX, { option_index: correct_button["data-option-index"].to_i })
    assert_equal true, attempt_for(CHECK_INDEX).correct

    # And the wrapper's correct-value, which lesson_quiz compares against, is the same
    # original index — not a screen position.
    wrapper = doc.css("[data-lesson-quiz-correct-value]").first
    assert_equal correct_button["data-option-index"], wrapper["data-lesson-quiz-correct-value"]
  end

  # "First option is the answer" was the tell §B exists to remove. One student's board is
  # a single draw and could legitimately put it first, so this asserts the DISTRIBUTION
  # over fixed seeds instead — deterministic, and it fails loudly if the permutation ever
  # degenerates to identity.
  test "the correct option does not stay pinned to the first row" do
    correct_original = OPTIONS.index { |o| o["correct"] }

    firsts = (0...120).map do |n|
      BV.for(user: "student-#{n}", route_step: "step", section_index: CHECK_INDEX)
        .order(OPTIONS.size, salt: "options").first
    end

    assert_operator firsts.count(correct_original), :<, 40,
                    "the correct option lands first far too often — the permutation is not doing its job"
    assert_equal OPTIONS.size, firsts.uniq.size,
                 "every option should reach the first row for some student"
  end
end
