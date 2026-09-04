require "test_helper"

# TWO CLASSES, and they pull against each other, which is the whole difficulty.
#
# A. "An attempt is a real attempt."  A retake must be able to score differently
#    from the first run. Today it cannot: `assessments_user_answers` has no
#    `assessment_result_id` and a unique index on `(user_id, question_id)`, so an
#    answer belongs to a USER and a QUESTION for the life of the account. The
#    second attempt reads the first attempt's rows and can never differ.
#
# B. "The anti-cheat guard still holds."  Answers are FINAL once given. That was
#    added deliberately: without it a student clicks each option until one shows
#    correct and guarantees 100%.
#
# The intent of B was right and its SCOPE was wrong — "final forever, globally"
# instead of "final within this attempt". B is written here BEFORE the migration
# so it can be proven on both sides of it.
module Assessments
  class RetakeTest < ActionDispatch::IntegrationTest
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
        route_module: preview, title: "Examen", position: 0, status: :available,
        content_type: :assessment, level: :nv1, bloom_level: 1
      )
      @assessment = Assessment.create!(
        route_step: @step, assessment_type: :level_up, passing_score: 70
      )
      @questions = 2.times.map do |i|
        Question.create!(
          assessment: @assessment, body: "Pregunta #{i}", question_type: :multiple_choice,
          options: %w[si no], correct_answer: "si", difficulty: 1, bloom_level: 1
        )
      end
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    # ── B: the anti-cheat guard ─────────────────────────────────────────────
    # Written first, and it must pass both before and after the migration.

    test "an answer cannot be re-graded inside the same attempt" do
      start_attempt
      question = @questions.first

      answer(question, "no")
      stored = current_answer_for(question)
      assert_equal "no", stored.answer
      assert_equal false, stored.correct

      # The cheat: try every other option until one grades correct.
      answer(question, "si")

      stored.reload
      assert_equal "no", stored.answer,
        "an answer was re-written inside one attempt — a student can click every " \
        "option until it shows correct and guarantee 100%"
      assert_equal false, stored.correct,
        "an answer was re-graded inside one attempt"
    end

    test "re-answering inside an attempt creates no second row" do
      start_attempt
      question = @questions.first

      answer(question, "no")
      assert_difference -> { UserAnswer.where(user: @user, question: question).count }, 0 do
        3.times { answer(question, "si") }
      end
    end

    # ── A: a retake is a real new run ───────────────────────────────────────

    test "a second attempt can score differently from the first" do
      first = start_attempt
      @questions.each { |q| answer(q, "no") }
      submit(first)

      assert_equal 0.0, first.reload.score, "all wrong must score 0"

      second = start_attempt
      assert_not_equal first.id, second.id, "starting again must open a NEW attempt"

      @questions.each { |q| answer(q, "si") }
      submit(second)

      assert_equal 100.0, second.reload.score,
        "the retake answered everything correctly and must score 100 — today the " \
        "answers belong to (user, question) for the life of the account, so the " \
        "second attempt re-reads the first attempt's rows and can never differ"
      assert_equal 0.0, first.reload.score,
        "the first attempt's score must not be rewritten by the retake"
    end

    test "a scored attempt does not lock answering forever" do
      first = start_attempt
      submit(first)
      assert_equal 0.0, first.reload.score

      second = start_attempt
      response_status = answer(@questions.first, "si")

      assert_not_equal 422, response_status,
        "`submitted?` asked whether this USER has ever been scored, and score 0.0 " \
        "is not nil — so one scored attempt refused every future answer, forever"
      assert current_answer_for(@questions.first, result: second)&.correct
    end

    test "each attempt keeps its own answers" do
      first = start_attempt
      @questions.each { |q| answer(q, "no") }
      submit(first)

      second = start_attempt
      @questions.each { |q| answer(q, "si") }
      submit(second)

      assert_equal 2, AssessmentResult.where(user: @user, assessment: @assessment).count
      assert_equal [0.0, 100.0],
        AssessmentResult.where(user: @user, assessment: @assessment).order(:created_at).pluck(:score)
    end

    private

    def start_attempt
      post assessments.start_assessment_path(@assessment)
      AssessmentResult.where(user: @user, assessment: @assessment, score: nil).order(:created_at).last
    end

    def answer(question, value)
      post assessments.assessment_answers_path(@assessment),
           params: { question_id: question.id, answer: value }
      response.status
    end

    def submit(result)
      post assessments.submit_result_path(result)
      response.status
    end

    # Deliberately does not assume the column exists yet: before the migration
    # there is one row per (user, question); after it, one per (result, question).
    def current_answer_for(question, result: nil)
      scope = UserAnswer.where(user: @user, question: question)
      if result && UserAnswer.column_names.include?("assessment_result_id")
        scope = scope.where(assessment_result_id: result.id)
      end
      scope.order(:created_at).last
    end
  end
end
