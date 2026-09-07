require "test_helper"

# WP-32 §2 — after one failed attempt there was no way to retake.
#
# `steps_controller` looked the result up with a bare
# `find_by(user:, assessment:)` — no `score` filter, no order, so an arbitrary
# row. `steps/_assessment.html.erb` showed the score ring and "Ver resultados"
# whenever that row had a score, and the ONLY Start button lived in the `else`
# branch. `results/show.html.erb` linked to the route or the next step and
# nothing else.
#
# So once a scored result was the one `find_by` happened to return, there was no
# Start anywhere: `failed_attempts` could never reach RELEASE_AFTER and the
# escape valve WP-29 built was unreachable from the UI. The only way forward was
# the header button — the hole §1 of this package closes. Closing that door
# without opening this one would trap the student for good.
module Assessments
  class RetakeIsReachableTest < ActionDispatch::IntegrationTest
    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      preview = LearningRoutesEngine::RouteModule.find_by!(
        learning_route_id: @route.id, access_state: :preview
      )
      @step = @route.route_steps.create!(
        route_module: preview, title: "Examen", position: 0, status: :in_progress,
        content_type: :assessment, level: :nv1, bloom_level: 1
      )
      @assessment = Assessment.create!(
        route_step: @step, assessment_type: :level_up, passing_score: 70
      )
      Question.create!(
        assessment: @assessment, body: "¿Y bien?", question_type: :multiple_choice,
        options: ["A) correcta", "B) incorrecta"], correct_answer: "A",
        difficulty: 1, bloom_level: 1
      )
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    # ── The step page ───────────────────────────────────────────────────────

    test "a scored-failed result on an uncompleted step still offers a retake" do
      failed_result(0)

      get learning_routes_engine.route_step_path(@route, @step)

      assert_response :success
      assert_select "form[action=?]", assessments.start_assessment_path(@assessment), { minimum: 1 },
        "a student who failed once had no Start button anywhere and could never reach RELEASE_AFTER"
    end

    test "the score card is still shown next to the retake" do
      failed_result(0)

      get learning_routes_engine.route_step_path(@route, @step)

      assert_select "form[action=?]", assessments.start_assessment_path(@assessment)
      assert_match I18n.t("learning_engine.assessment.not_passed", locale: :es), response.body
    end

    test "a completed step offers no retake" do
      failed_result(100)
      @step.update!(status: :completed)

      get learning_routes_engine.route_step_path(@route, @step)

      assert_response :success
      assert_select "form[action=?]", assessments.start_assessment_path(@assessment), false,
        "a completed step must not invite another attempt"
    end

    # The row the page shows must be decided, not whichever one `find_by`
    # returns. An open attempt is what the student is in the middle of; a scored
    # one is the last thing that happened.
    test "an open attempt outranks an older scored one" do
      failed_result(0)
      open_attempt = AssessmentResult.create!(user: @user, assessment: @assessment)

      get learning_routes_engine.route_step_path(@route, @step)

      assert_equal open_attempt.id, assigns_existing_result_id,
        "the page picked an arbitrary row instead of the attempt in progress"
    end

    test "the latest scored attempt is the one shown when nothing is open" do
      failed_result(0)
      latest = failed_result(40)

      get learning_routes_engine.route_step_path(@route, @step)

      assert_equal latest.id, assigns_existing_result_id
    end

    # ── The results page ────────────────────────────────────────────────────

    test "a blocked decision offers the retake on the results page, with attempts left" do
      result = failed_result(0)

      get assessments.result_path(result)

      assert_response :success
      assert_select "form[action=?]", assessments.start_assessment_path(@assessment), { minimum: 1 },
        "the flash said try again and the page offered no way to"
      decision = AdvancementPolicy.new(result: result).decide
      assert_match I18n.t("assessments.results.attempts_left", count: decision.attempts_left, locale: :es),
        response.body
    end

    test "a released decision does not tell the student they still need a passing score" do
      AdvancementPolicy::RELEASE_AFTER.times { failed_result(0) }
      result = AssessmentResult.where(user: @user, assessment: @assessment).order(:created_at).last

      get assessments.result_path(result)

      assert_response :success
      assert_no_match need_score_copy, response.body,
        "the flash said the student may continue and the page contradicted it"
      assert_no_match Regexp.new(Regexp.escape(I18n.t("assessments.results.keep_going", locale: :es))),
        response.body
    end

    test "an unanswerable decision does not tell the student they still need a passing score" do
      Question.where(assessment_id: @assessment.id).update_all(correct_answer: "Z) no existe")
      result = failed_result(0)

      get assessments.result_path(result)

      assert_response :success
      assert_no_match need_score_copy, response.body,
        "the exam cannot be passed by anyone and the page still demanded a pass mark"
    end

    test "a passed decision still congratulates" do
      result = failed_result(100)

      get assessments.result_path(result)

      assert_match Regexp.new(Regexp.escape(I18n.t("assessments.results.congrats", locale: :es))),
        response.body
    end

    private

    def need_score_copy
      Regexp.new(Regexp.escape(
        I18n.t("assessments.results.need_score", score: @assessment.passing_score, locale: :es)
      ))
    end

    def failed_result(score)
      AssessmentResult.create!(user: @user, assessment: @assessment, score: score)
    end

    # The rendered page is the contract, but WHICH row it chose is the defect, so
    # read it from the score the card shows rather than reaching into the
    # controller.
    def assigns_existing_result_id
      @controller.instance_variable_get(:@existing_result)&.id
    end
  end
end
