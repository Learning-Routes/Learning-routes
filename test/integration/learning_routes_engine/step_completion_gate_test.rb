require "test_helper"

# THE CLASS: a step advances only through a decision that read the gate.
#
# WP-29 §3 made failing an exam stop completing the step — through
# `results#submit`. It closed one door. The header's "Completar paso" button
# posts to `steps#complete`, which is a different door into the same room, and
# that one gated on two things an assessment step never has: outstanding
# interactive blocks (an assessment has no `AiContent`, so `SectionResolver`
# finds no sections) and `requires_quiz?` (lesson/exercise only). A student who
# scored 0% clicked the header button and the step completed, the next step
# unlocked, and nothing was recorded on the step.
#
# So the test is not "the exam gate works". It is: for EVERY content type, a
# `POST complete` on a step whose gate is not satisfied must leave the step
# alone, in all three formats the action answers, and must say why. Then the
# same POST with the gate satisfied must complete it exactly once.
#
# Four content types, four gates:
#
#   lesson      an unanswered gating block
#   exercise    a step quiz that has not been passed
#   assessment  a scored result that did not pass  <- the hole this package closes
#   review      an unanswered gating block (review has no quiz — see
#               RouteStep#requires_quiz?)
module LearningRoutesEngine
  class StepCompletionGateTest < ActionDispatch::IntegrationTest
    CHECK_SECTION = {
      "type" => "check",
      "question" => "¿Cuál es la correcta?",
      "options" => [
        { "label" => "La correcta", "correct" => true },
        { "label" => "La incorrecta", "correct" => false }
      ]
    }.freeze

    FORMATS = %i[json turbo_stream html].freeze

    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      @preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    # ── The gate is not satisfied: nothing may move, in any format ──────────

    test "a lesson with an unanswered gating block refuses in all three formats" do
      assert_refuses(build_lesson_with_outstanding_block)
    end

    test "an exercise whose step quiz is not passed refuses in all three formats" do
      assert_refuses(build_exercise_with_unpassed_quiz)
    end

    # THE HOLE. Red before this package: the step completes.
    test "an assessment failed once refuses in all three formats" do
      assert_refuses(build_assessment_with_failed_result)
    end

    test "an assessment never attempted refuses in all three formats" do
      assert_refuses(build_assessment_with_no_result)
    end

    test "a review with an unanswered gating block refuses in all three formats" do
      assert_refuses(build_review_with_outstanding_block)
    end

    # ── The gate is satisfied: it completes, exactly once ───────────────────

    test "a lesson completes once its gating block is answered and its quiz is passed" do
      step = build_lesson_with_outstanding_block
      satisfy_block!(step)
      pass_step_quiz!(step)

      assert_completes_exactly_once(step)
      assert_nil step.reload.metadata["advanced_without_passing"]
    end

    test "an exercise completes once its step quiz is passed" do
      step = build_exercise_with_unpassed_quiz
      pass_step_quiz!(step)

      assert_completes_exactly_once(step)
      assert_nil step.reload.metadata["advanced_without_passing"]
    end

    test "a review completes once its gating block is answered" do
      step = build_review_with_outstanding_block
      satisfy_block!(step)

      assert_completes_exactly_once(step)
      assert_nil step.reload.metadata["advanced_without_passing"]
    end

    test "a passed assessment completes and is not recorded as a release" do
      step = build_assessment_with_no_result
      scored_result(step, 100)

      assert_completes_exactly_once(step)
      assert_nil step.reload.metadata["advanced_without_passing"],
        "a genuine pass must not be recorded as a release"
    end

    # The escape valve reached through THIS door, recorded exactly as
    # `results#submit` records it — one helper, so the two cannot drift.
    test "a released assessment completes and records advanced_without_passing" do
      step = build_assessment_with_no_result
      Assessments::AdvancementPolicy::RELEASE_AFTER.times { scored_result(step, 0) }

      assert_completes_exactly_once(step)

      metadata = step.reload.metadata
      assert_equal true, metadata["advanced_without_passing"]
      assert_equal "released", metadata["advanced_reason"]
      assert metadata["advanced_at"].present?
    end

    test "an unanswerable assessment completes and records advanced_without_passing" do
      step = build_assessment_with_no_result(correct_answer: "Z) no existe")
      scored_result(step, 0)

      assert_completes_exactly_once(step)

      metadata = step.reload.metadata
      assert_equal true, metadata["advanced_without_passing"]
      assert_equal "unanswerable", metadata["advanced_reason"]
    end

    # §3 — replaying the POST used to award lesson XP again, from numbers the
    # client sent, because `complete_step!` returns early on a completed step but
    # `award_lesson_xp!` ran anyway and `XpService.award` has no dedupe.
    test "posting complete twice on a lesson writes one lesson XP transaction" do
      step = build_lesson_with_outstanding_block
      satisfy_block!(step)
      pass_step_quiz!(step)

      2.times { post_complete(step, :json, params: { quiz_results: { correct: 3, total: 3 } }) }

      lesson_rows = XpTransaction.where(user: @user).where(source_type: %w[lesson_complete lesson_perfect])
      assert_equal 1, lesson_rows.count,
        "replaying complete re-awarded lesson XP on an already-completed step"
    end

    # The student passed the quiz at 80, not 100. The client claims 3 of 3.
    test "lesson XP is not decided by numbers the client sends" do
      step = build_lesson_with_outstanding_block
      satisfy_block!(step)
      pass_step_quiz!(step, score: 80)

      post_complete(step, :json, params: { quiz_results: { correct: 3, total: 3 } })

      assert_equal "lesson_complete",
        XpTransaction.where(user: @user).where(source_type: %w[lesson_complete lesson_perfect]).sole.source_type,
        "the client claimed a perfect quiz and was paid for it; there is no such persisted result"
    end

    private

    # ── Assertions ──────────────────────────────────────────────────────────

    def assert_refuses(step)
      FORMATS.each do |format|
        step.update!(status: :in_progress)

        assert_no_difference -> { XpTransaction.where(user: @user).count },
          "#{step.content_type}/#{format}: a refused completion paid XP" do
          post_complete(step, format)
        end

        assert_equal "in_progress", step.reload.status,
          "#{step.content_type}/#{format}: the gate was not consulted — the step completed"
        assert_says_why(format, step)
      end
    end

    def assert_says_why(format, step)
      case format
      when :json
        assert_response :unprocessable_entity, "#{step.content_type}/json: expected a 422"
        body = JSON.parse(response.body)
        assert body.keys.any? { |key| key.end_with?("_required") } || body["reason"].present?,
          "#{step.content_type}/json: the refusal named no reason: #{response.body}"
      when :turbo_stream
        assert_response :success
        assert_match(/turbo-stream/, response.body,
          "#{step.content_type}/turbo_stream: no stream was rendered")
        assert response.body.strip.present?
      when :html
        assert_redirected_to learning_routes_engine.route_step_path(@route, step)
        assert flash[:notice].present?,
          "#{step.content_type}/html: the student was redirected with nothing said"
      end
    end

    def assert_completes_exactly_once(step)
      step.update!(status: :in_progress)

      post_complete(step, :json)
      assert_response :success, "the gate was satisfied and the step still did not complete"
      assert_equal "completed", step.reload.status

      before = XpTransaction.where(user: @user).count
      post_complete(step, :json)
      assert_equal before, XpTransaction.where(user: @user).count,
        "a replayed completion awarded XP a second time"
    end

    # ── Requests ────────────────────────────────────────────────────────────

    def post_complete(step, format, params: {})
      path = learning_routes_engine.complete_route_step_path(@route, step)
      case format
      when :json
        post path, params: params, as: :json
      when :turbo_stream
        post path, params: params, headers: { "Accept" => "text/vnd.turbo-stream.html" }
      when :html
        post path, params: params
      end
    end

    # ── Fixtures ────────────────────────────────────────────────────────────

    def build_step(content_type, **attributes)
      @route.route_steps.create!(
        route_module: @preview, title: "Paso #{content_type}", position: next_position,
        status: :in_progress, content_type: content_type, level: :nv1, bloom_level: 1,
        **attributes
      )
    end

    def next_position
      @position = (@position || -1) + 1
    end

    # A lesson gates on TWO things: its interactive blocks and its step quiz.
    # This one starts with the block outstanding and no quiz taken.
    def build_lesson_with_outstanding_block
      step = build_step(:lesson, metadata: { "parsed_sections" => [CHECK_SECTION.deep_dup] })
      build_step_quiz(step)
      step
    end

    def build_review_with_outstanding_block
      build_step(:review, metadata: { "parsed_sections" => [CHECK_SECTION.deep_dup] })
    end

    def build_exercise_with_unpassed_quiz
      step = build_step(:exercise)
      build_step_quiz(step)
      step
    end

    def build_step_quiz(step)
      quiz = Assessments::Assessment.create!(
        route_step: step, assessment_type: :step_quiz, passing_score: 80
      )
      Assessments::Question.create!(
        assessment: quiz, body: "¿Y bien?", question_type: :multiple_choice,
        options: ["A) sí", "B) no"], correct_answer: "A", difficulty: 1, bloom_level: 1
      )
      quiz
    end

    # 100 unless a test cares about the difference between "passed" and
    # "perfect" — the quiz's pass mark is 80.
    def pass_step_quiz!(step, score: 100)
      quiz = Assessments::Assessment.find_by!(route_step: step, assessment_type: :step_quiz)
      Assessments::AssessmentResult.create!(user: @user, assessment: quiz, score: score)
    end

    def build_assessment_with_no_result(correct_answer: "A")
      step = build_step(:assessment)
      assessment = Assessments::Assessment.create!(
        route_step: step, assessment_type: :level_up, passing_score: 70
      )
      Assessments::Question.create!(
        assessment: assessment, body: "¿Y bien?", question_type: :multiple_choice,
        options: ["A) correcta", "B) incorrecta"], correct_answer: correct_answer,
        difficulty: 1, bloom_level: 1
      )
      step
    end

    def build_assessment_with_failed_result
      step = build_assessment_with_no_result
      scored_result(step, 0)
      step
    end

    def scored_result(step, score)
      Assessments::AssessmentResult.create!(
        user: @user, assessment: Assessments::Assessment.find_by!(route_step: step), score: score
      )
    end

    def satisfy_block!(step)
      post learning_routes_engine.route_step_block_attempt_path(@route, step, section_index: 0),
           params: { block: { option_index: 0, submission_complete: true } },
           as: :json
      assert_response :success
    end
  end
end
