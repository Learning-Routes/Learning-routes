require "test_helper"

# WP-32 §1 — the button is how a student FINDS the hole; the POST is the hole.
#
# `layouts/learning.html.erb` renders "Completar paso" for every `@step` that is
# not completed. `AssessmentsController` and `ResultsController` both use that
# layout and both set `@step = @assessment.route_step`, so the button sat on the
# exam page and on the results page — one click past a 0%.
#
# The POST is gated now (see StepCompletionGateTest, which is the test that
# matters). This one keeps the button off the pages where it never made sense:
# an assessment step has its own verbs — Start, Submit, Retake — and a header
# button that says "mark this done" is not one of them.
module Assessments
  class CompleteStepButtonAbsentTest < ActionDispatch::IntegrationTest
    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      @preview = LearningRoutesEngine::RouteModule.find_by!(
        learning_route_id: @route.id, access_state: :preview
      )
      @step = @route.route_steps.create!(
        route_module: @preview, title: "Examen", position: 0, status: :in_progress,
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

    test "the assessment step page renders no complete-step form" do
      get learning_routes_engine.route_step_path(@route, @step)

      assert_response :success
      assert_no_complete_form
    end

    test "the exam intro page renders no complete-step form" do
      get assessments.assessment_path(@assessment)

      assert_response :success
      assert_no_complete_form
    end

    test "the exam page renders no complete-step form" do
      post assessments.start_assessment_path(@assessment)
      get assessments.take_assessment_path(@assessment)

      assert_response :success
      assert_no_complete_form
    end

    test "the results page renders no complete-step form" do
      result = AssessmentResult.create!(user: @user, assessment: @assessment, score: 0)

      get assessments.result_path(result)

      assert_response :success
      assert_no_complete_form
    end

    # The button is right where it always was for the types that earn it.
    test "a lesson step still renders the complete-step form" do
      lesson = @route.route_steps.create!(
        route_module: @preview, title: "Lección", position: 1, status: :in_progress,
        content_type: :lesson, level: :nv1, bloom_level: 1
      )

      get learning_routes_engine.route_step_path(@route, lesson)

      assert_response :success
      assert_select "form[action=?]", learning_routes_engine.complete_route_step_path(@route, lesson)
    end

    private

    def assert_no_complete_form
      assert_select "form[action=?]",
        learning_routes_engine.complete_route_step_path(@route, @step), false,
        "the header offered to mark an exam step done from a page about failing it"
    end
  end
end
