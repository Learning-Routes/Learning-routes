require "test_helper"

# THE CLASS: a generation defect must never render as a gate the student cannot
# pass.
#
# Seen in production: a `DESAFÍO RÁPIDO` modal titled "Elige la traducción
# correcta (evaluación)" with four Spanish options and NO English sentence to
# translate. `section[:question]` held the instruction; the stem was lost
# upstream. The student could only guess, and a wrong guess costs a heart — and
# because a check gates completion, it also blocked the step.
#
# `BlockGrader` already fails OPEN on data quality when GRADING ("a section we
# cannot grade must never trap a student behind our own generation bug"). But
# grading happens per SUBMISSION, and the GATE is decided before any submission
# exists. So the gate needed the same instinct, which is what
# `BlockGrader.answerable?` gives it.
#
# Asserted at the model boundary rather than on the parser: the failure is not a
# mis-parse, it is a trap, and the trap is `outstanding_blocks_for`.
class LearningRoutesEngine::UnanswerableGateTest < ActiveSupport::TestCase
  BG = LearningRoutesEngine::BlockGrader

  ANSWERABLE_CHECK = {
    "type" => "check",
    "question" => "¿Cuál significa \"please\"?",
    "options" => [
      { "label" => "por favor", "correct" => true },
      { "label" => "gracias", "correct" => false }
    ]
  }.freeze

  def setup
    @user = create_test_user
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
  end

  # ── the gate ────────────────────────────────────────────────────────────

  test "a check with no stem does not gate the step" do
    step = step_with([ANSWERABLE_CHECK.merge("question" => "")])

    assert_empty step.outstanding_blocks_for(@user),
      "a check with no question is unanswerable except by guessing; it must not trap"
  end

  test "a check with no options does not gate the step" do
    step = step_with([ANSWERABLE_CHECK.merge("options" => [])])

    assert_empty step.outstanding_blocks_for(@user)
  end

  test "a check with no correct option does not gate the step" do
    step = step_with([
      ANSWERABLE_CHECK.merge("options" => [
        { "label" => "por favor", "correct" => false },
        { "label" => "gracias", "correct" => false }
      ])
    ])

    assert_empty step.outstanding_blocks_for(@user),
      "no option is right, so no answer can ever satisfy this gate"
  end

  # The guard must not swallow real gates — that would be a worse bug than the
  # one it fixes, because it would let students past work they never did.
  test "a well-formed check still gates the step" do
    step = step_with([ANSWERABLE_CHECK])

    assert_equal [{ section_index: 0, block_type: "check" }], step.outstanding_blocks_for(@user)
  end

  test "an unanswerable check does not hide an answerable one beside it" do
    step = step_with([ANSWERABLE_CHECK.merge("question" => ""), ANSWERABLE_CHECK])

    assert_equal [{ section_index: 1, block_type: "check" }], step.outstanding_blocks_for(@user)
  end

  # The client lock is rendered from its own expression, so it needs the same
  # guard: otherwise the server lets the student through and the Continue button
  # does not.
  test "the rendered gating flag agrees with the server's gate" do
    template = Rails.root.join(
      "engines/learning_routes_engine/app/views/learning_routes_engine/steps/_lesson.html.erb"
    ).read
    gating_attribute = template[/data-gating="[^"]*"/m]

    assert gating_attribute.present?, "the gating attribute moved; this test is now blind"
    assert_match(/answerable\?/, gating_attribute,
      "data-gating must consult answerable? too, or the client keeps locking a " \
      "question the server has already stopped requiring")
  end

  # ── the predicate, per gating type ──────────────────────────────────────

  test "answerable? is false for every empty gating block" do
    assert_not BG.answerable?({ "type" => "check", "question" => "q", "options" => [] })
    assert_not BG.answerable?({ "type" => "drag_drop", "pairs" => [] })
    assert_not BG.answerable?({ "type" => "fill_blank", "sentence" => "a ___", "blanks" => [] })
    assert_not BG.answerable?({ "type" => "flashcards", "cards" => [] })
    assert_not BG.answerable?({ "type" => "scenario", "situation" => "s", "options" => [] })
  end

  test "answerable? is true for populated gating blocks" do
    assert BG.answerable?(ANSWERABLE_CHECK)
    assert BG.answerable?({ "type" => "drag_drop", "pairs" => [{ "term" => "a", "definition" => "b" }] })
    assert BG.answerable?({ "type" => "fill_blank", "sentence" => "a ___", "blanks" => ["b"] })
    assert BG.answerable?({ "type" => "flashcards", "cards" => [{ "front" => "a", "back" => "b" }] })
    assert BG.answerable?({ "type" => "scenario", "situation" => "s",
                            "options" => [{ "label" => "a" }] })
  end

  # Non-gating types are never inspected: they cannot trap anyone.
  test "answerable? does not judge non-gating blocks" do
    assert BG.answerable?({ "type" => "concept" })
    assert BG.answerable?({ "type" => "summary", "body" => "" })
  end

  test "answerable? accepts symbol keys as well as string keys" do
    assert_not BG.answerable?({ type: "check", question: "", options: [{ label: "a", correct: true }] })
    assert BG.answerable?({ type: "check", question: "q", options: [{ label: "a", correct: true }] })
  end

  private

  def step_with(sections)
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    @route.route_steps.create!(
      route_module: preview, title: "Lección", position: @route.route_steps.count,
      status: :available, content_type: :lesson, level: :nv1, bloom_level: 1,
      metadata: { "parsed_sections" => sections.map(&:deep_dup), "content_ready" => true }
    )
  end
end
