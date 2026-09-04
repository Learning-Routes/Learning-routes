require "test_helper"

# WP-29 §3 — failing the exam completed the step.
#
# `submit` called `complete_step!` unconditionally. The assessment was
# decoration: a score was recorded, `passed` was set, and NOTHING read either. A
# student could score 0% and the next step unlocked exactly as if they had aced
# it. The whole gate was theatre.
#
# The fix cannot simply be "gate on passed?", because this codebase has twice
# shipped an exam that nobody could pass (§1 in this very package). So there are
# three ways forward — earned, released, impossible — and only the first is a
# pass.
module Assessments
  class FailingDoesNotAdvanceTest < ActionDispatch::IntegrationTest
    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      @preview = LearningRoutesEngine::RouteModule.find_by!(
        learning_route_id: @route.id, access_state: :preview
      )
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    test "failing the exam leaves the step incomplete" do
      assessment = build_assessment
      attempt(assessment, answer: "B) incorrecta")

      assert_not step_for(assessment).completed?,
        "failing the exam completed the step: complete_step! ran unconditionally"
      assert_equal false, result_for(assessment).passed
    end

    test "passing the exam completes the step" do
      assessment = build_assessment
      attempt(assessment, answer: "A) correcta")

      assert step_for(assessment).completed?
      assert result_for(assessment).passed
      assert_nil step_for(assessment).metadata["advanced_without_passing"],
        "a genuine pass must not be recorded as a release"
    end

    # The escape valve. Gating on `passed?` alone would trap a student behind a
    # question whose answer key is wrong — which is the defect §1 of this same
    # package just fixed. RELEASE_AFTER is the house precedent for exactly this.
    test "the escape valve opens after RELEASE_AFTER failures and records released, not passed" do
      assessment = build_assessment
      release_after = AdvancementPolicy::RELEASE_AFTER

      (release_after - 1).times do
        attempt(assessment, answer: "B) incorrecta")
        assert_not step_for(assessment).completed?, "released too early"
      end

      attempt(assessment, answer: "B) incorrecta")

      step = step_for(assessment)
      assert step.completed?, "a student who cannot pass must not be trapped forever"
      assert_equal true, step.metadata["advanced_without_passing"]
      assert_equal "released", step.metadata["advanced_reason"]
      assert_equal false, result_for(assessment).passed,
        "being let through is not passing, and must never be recorded as one"
    end

    # An exam nobody can pass must not gate anyone, and must not make them fail
    # it three times first.
    test "an unanswerable exam does not gate, on the very first attempt" do
      # `correct_answer` matches no option, so the best achievable score is 0.
      assessment = build_assessment(correct_answer: "Z) no existe")
      attempt(assessment, answer: "A) correcta")

      step = step_for(assessment)
      assert step.completed?, "an exam whose pass mark is unreachable must never block a student"
      assert_equal "unanswerable", step.metadata["advanced_reason"]
      assert_equal false, result_for(assessment).passed
    end

    # An exam with one broken question out of four is still passable at 70%, so
    # it must keep gating. The unanswerable rule is about impossibility, not
    # about any fault at all.
    test "one broken question does not disable the gate when the pass mark is still reachable" do
      assessment = build_assessment(question_count: 4, broken_questions: 1)
      attempt(assessment, answer: "B) incorrecta")

      assert_not step_for(assessment).completed?,
        "3 of 4 answerable is 75%, above the 70% pass mark — the gate must still hold"
    end

    test "the student is told why, in their own locale" do
      assessment = build_assessment
      attempt(assessment, answer: "B) incorrecta")

      assert_equal I18n.t("flash.assessment_failed", score: 0.0, passing_score: 70,
                                                     attempts_left: AdvancementPolicy::RELEASE_AFTER - 1,
                                                     locale: :es),
        flash[:notice],
        "a student who failed used to be congratulated on their submission"
    end

    private

    def build_assessment(question_count: 1, broken_questions: 0, correct_answer: "A")
      step = @route.route_steps.create!(
        route_module: @preview, title: "Examen", position: 0, status: :available,
        content_type: :assessment, level: :nv1, bloom_level: 1
      )
      assessment = Assessment.create!(route_step: step, assessment_type: :level_up, passing_score: 70)

      question_count.times do |i|
        Question.create!(
          assessment: assessment, body: "Pregunta #{i}", question_type: :multiple_choice,
          options: ["A) correcta", "B) incorrecta"],
          correct_answer: i < broken_questions ? "Z) no existe" : correct_answer,
          difficulty: 1, bloom_level: 1
        )
      end
      assessment
    end

    def attempt(assessment, answer:)
      post assessments.start_assessment_path(assessment)
      Question.where(assessment_id: assessment.id).order(:created_at).each do |question|
        post assessments.assessment_answers_path(assessment),
             params: { question_id: question.id, answer: answer }
      end
      post assessments.submit_result_path(result_for(assessment))
    end

    def result_for(assessment)
      AssessmentResult.where(user: @user, assessment: assessment).order(:created_at).last
    end

    def step_for(assessment)
      LearningRoutesEngine::RouteStep.find(assessment.route_step_id)
    end
  end
end
