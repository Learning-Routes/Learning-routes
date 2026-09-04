require "application_system_test_case"

# WP-29 §2 — "selecting an answer saves nothing, and submitting gathers nothing".
#
# The only binding to the save path was the "Guardar respuesta" button. A student
# who selected all four options and pressed "Enviar evaluación" sent four checked
# radios to a form that carries no answers, and ZERO requests to /answers. The
# exam scored 0% with four "sin responder" — on an exam they had answered
# correctly.
#
# This asserts ROWS, not DOM. A green DOM assertion is what let the defect ship:
# the page looked answered the whole time.
class ExamSubmitGathersTest < ApplicationSystemTestCase
  QUESTION_COUNT = 4

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
    @assessment = Assessments::Assessment.create!(
      route_step: @step, assessment_type: :level_up, passing_score: 70
    )
    # Letter-prefixed options against a bare-letter `correct_answer` — the exact
    # production shape from §1. Grading this in a real browser proves the
    # normalizer is wired into the path a student actually walks.
    QUESTION_COUNT.times do |i|
      Assessments::Question.create!(
        assessment: @assessment, body: "Pregunta número #{i + 1}",
        question_type: :multiple_choice,
        options: ["A) correcta #{i}", "B) incorrecta #{i}", "C) tampoco #{i}"],
        correct_answer: "A", difficulty: 1, bloom_level: 1
      )
    end
    sign_in_through_ui
  end

  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  test "selecting every answer and pressing send records every answer and scores 100" do
    start_exam
    answer_every_question

    # The rule this fix must not break: selecting is NOT saving. WP-27 made an
    # answer final once given, so auto-saving on `change` would make the first
    # click final and lock out a change of mind.
    assert_equal 0, saved_answers.count,
      "selecting must not save; auto-saving on change makes the first click final"

    submit_exam

    assert_current_path assessments.result_path(result), wait: 15

    assert_equal QUESTION_COUNT, saved_answers.count,
      "submit did not gather: the form posts the score with no answers attached"
    assert_in_delta 100.0, result.reload.score.to_f, 0.01,
      "every option chosen was the correct one"
  end

  # The counter is in the SIDEBAR, which used to be a sibling of the controller
  # element rather than inside it — so `hasCurrentIndicatorTarget` was false,
  # `updateDisplay` no-opped, and the counter read "0 de 4 respondidas" no matter
  # how many answers were saved.
  test "the sidebar counts the answers as they are selected" do
    start_exam
    assert_text I18n.t("assessments.exam.answered", count: 0, total: QUESTION_COUNT, locale: :es)

    answer_every_question

    expected = I18n.t("assessments.exam.answered_template", locale: :es)
                   .sub("__count__", QUESTION_COUNT.to_s).sub("__total__", QUESTION_COUNT.to_s)
    assert_equal expected, find("[data-question-nav-target='currentIndicator']").text, <<~WHY
      the counter never moved. The sidebar sits outside the question-nav element,
      so its targets were never registered on the controller doing the saving.
    WHY
  end

  # Submitting after a partial save scores a full exam on half its answers.
  test "a refused save blocks the submission and names the question" do
    start_exam
    answer_every_question

    # Close the attempt underneath the open page: every save now 422s.
    Assessments::AssessmentResult
      .where(user: @user, assessment: @assessment, score: nil)
      .update_all(score: 0.0, updated_at: Time.current)

    submit_exam

    assert_current_path assessments.take_assessment_path(@assessment), wait: 10
    # `text:` so Capybara retries until the banner settles. Asserting presence and
    # then reading `.text` passes the moment the element appears and can read a
    # message written mid-gather.
    # The student must be told WHICH answer did not save, not just that something
    # failed. `text:` so Capybara retries until the banner settles: asserting
    # presence and then reading `.text` passes the moment the element appears,
    # which can be a message written mid-gather.
    assert_selector "[data-question-nav-target='saveError']", visible: true,
      text: /pregunta 1/i, wait: 10
  end

  private

  def result
    Assessments::AssessmentResult.where(user: @user, assessment: @assessment).order(:created_at).last
  end

  def saved_answers
    Assessments::UserAnswer.where(assessment_result_id: result&.id)
  end

  def start_exam
    visit assessments.assessment_path(@assessment)
    within "form[action='#{assessments.start_assessment_path(@assessment)}']" do
      find("input[type='submit'], button", match: :first).click
    end
    assert_current_path assessments.take_assessment_path(@assessment), wait: 10
  end

  # Only one panel is visible at a time. Walk with "Siguiente", which sits inside
  # the controller element whether or not the sidebar does — so §2 is tested
  # independently of the scope fix rather than on top of it.
  def answer_every_question
    QUESTION_COUNT.times do |index|
      within find("[data-question-nav-target='questionPanel']:not(.hidden)") do
        find("input[type='radio']", match: :first).click
      end
      find("[data-action*='question-nav#next']").click unless index == QUESTION_COUNT - 1
    end
  end

  def submit_exam
    within "form[action='#{assessments.submit_result_path(result)}']" do
      find("input[type='submit']").click
    end
  end

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    assert_field "email", with: @user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
  end
end
