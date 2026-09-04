require "application_system_test_case"

# THE CLASS: a form the student presses does not navigate.
#
# This cannot be asserted on the server's status code, and the attempt to do so
# is why the previous fix shipped incomplete. WP-25 §1 correctly removed a 406,
# and its test asserted `assert_response :success` — which a 200 HTML render
# passes while the button does nothing at all. Turbo refuses a form response
# that is not a redirect or a turbo_stream:
#
#   Error: Form responses must redirect to another location
#     formSubmissionErrored @ turbo.es2017-esm.js:4906
#
# So the server was healthy, the test was green, and the page still did not move.
# The only thing that can catch that is a real browser asserting the page
# CHANGED — which is what this does.
class ExamStartTest < ApplicationSystemTestCase
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
    @question = Assessments::Question.create!(
      assessment: @assessment, body: "¿Cuál significa \"por favor\"?",
      question_type: :multiple_choice, options: %w[please thanks sorry],
      correct_answer: "please", difficulty: 1, bloom_level: 1
    )
    sign_in_through_ui
  end

  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  test "pressing Iniciar examen actually navigates to the exam" do
    visit assessments.assessment_path(@assessment)
    assert_button_present

    click_start

    assert_current_path assessments.take_assessment_path(@assessment), wait: 10
    assert_text @question.body, wait: 10
  end

  test "the exam page is reachable by GET, so a refresh does not re-POST" do
    visit assessments.assessment_path(@assessment)
    click_start
    assert_current_path assessments.take_assessment_path(@assessment), wait: 10

    before = Assessments::AssessmentResult.where(user: @user, assessment: @assessment).count
    visit current_path
    assert_text @question.body, wait: 10

    assert_equal before,
      Assessments::AssessmentResult.where(user: @user, assessment: @assessment).count,
      "reloading the exam created another result; a GET must not create"
  end

  # A GET that created a result would hand one out to every refresh, prefetch and
  # back-button. Without a result in progress the student has not started.
  test "visiting the exam directly without starting goes back to the intro" do
    visit assessments.take_assessment_path(@assessment)

    assert_current_path assessments.assessment_path(@assessment), wait: 10
    assert_equal 0, Assessments::AssessmentResult.where(user: @user, assessment: @assessment).count
  end

  test "starting twice reuses the in-progress result" do
    visit assessments.assessment_path(@assessment)
    click_start
    assert_current_path assessments.take_assessment_path(@assessment), wait: 10

    visit assessments.assessment_path(@assessment)
    click_start
    assert_current_path assessments.take_assessment_path(@assessment), wait: 10

    assert_equal 1, Assessments::AssessmentResult.where(user: @user, assessment: @assessment).count
  end

  # §3. A 422 is a RESOLVED promise with ok:false, so `if (response.ok)` was
  # simply skipped: no answeredSet entry, no "Guardado", no catch, nothing
  # logged. Every answer was thrown away in silence, which is why the console was
  # clean while the exam recorded nothing.
  test "a refused answer save puts a visible message on the page" do
    visit assessments.assessment_path(@assessment)
    click_start
    assert_current_path assessments.take_assessment_path(@assessment), wait: 10

    # Answer normally, then close the attempt underneath the open page — exactly
    # the state that used to refuse every save with no sign of it.
    # `update_all`, not `update!`: a validation on the record lazily loads
    # :assessment and strict_loading raises. The test is about the browser, not
    # about that association.
    Assessments::AssessmentResult
      .where(user: @user, assessment: @assessment, score: nil)
      .update_all(score: 0.0, updated_at: Time.current)

    save_an_answer

    assert_selector "[data-question-nav-target='saveError']", visible: true, wait: 8
    assert_equal I18n.t("assessments.answers.no_attempt", locale: :es),
      find("[data-question-nav-target='saveError']").text,
      "the student must be told the attempt is closed, not left watching a button that never changes"
  end

  private

  def save_an_answer
    within "[data-question-nav-target='questionPanel']", match: :first do
      find("input[type='radio']", match: :first).click
    end
    find("[data-action*='question-nav#saveAnswer']", match: :first).click
  end

  def assert_button_present
    assert_selector "form[action='#{assessments.start_assessment_path(@assessment)}'] input[type='submit'], " \
                    "form[action='#{assessments.start_assessment_path(@assessment)}'] button",
      wait: 10
  end

  def click_start
    within "form[action='#{assessments.start_assessment_path(@assessment)}']" do
      find("input[type='submit'], button", match: :first).click
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
