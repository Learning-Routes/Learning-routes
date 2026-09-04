require "test_helper"

# The owner pressed "Iniciar examen" on a live route and nothing happened. Turbo
# logged `POST .../start 406 (Not Acceptable)` on every press.
#
# `button_to` is a form, so Turbo intercepts it and sends
# `Accept: text/vnd.turbo-stream.html, text/html, …`. `respond_to` declared
# `format.turbo_stream`, picked it because it is first in that Accept list, and
# found no `start.turbo_stream.erb` — which has never existed. Rails raises
# `ActionController::MissingExactTemplate`, a subclass of
# `ActionController::UnknownFormat`, mapped to 406.
#
# The header is the whole test. A request without it passes even when the bug is
# present, which is why nothing caught this.
module Assessments
  class StartExamTest < ActionDispatch::IntegrationTest
    # Exactly what Turbo sends for a `button_to`.
    TURBO_ACCEPT = "text/vnd.turbo-stream.html, text/html, application/xhtml+xml".freeze

    def setup
      @user = create_test_user(email_verified_at: Time.current)
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
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    # WP-26 §1 replaced this assertion. It used to be `assert_response :success`,
    # which a 200 HTML render passes — and a 200 HTML render is exactly what Turbo
    # REFUSES for a form submission ("Form responses must redirect to another
    # location"). So the server was healthy, this test was green, and the button
    # still did nothing. A status code cannot express "the page navigated";
    # test/system/exam_start_test.rb asserts that in a real browser.
    #
    # What this file can pin is the SHAPE: a POST mutates and redirects with 303,
    # which is what lets Turbo turn it into a GET.
    test "starting an exam redirects to the exam with 303, never renders" do
      post assessments.start_assessment_path(@assessment), headers: { "Accept" => TURBO_ACCEPT }

      assert_response :see_other,
        "Turbo discards a 2xx HTML form response; only a redirect (303, so the " \
        "POST becomes a GET) actually moves the student to the exam"
      assert_redirected_to assessments.take_assessment_path(@assessment)
    end

    test "starting an exam creates the result the exam page needs" do
      assert_difference -> { AssessmentResult.where(user: @user, assessment: @assessment).count }, 1 do
        post assessments.start_assessment_path(@assessment), headers: { "Accept" => TURBO_ACCEPT }
      end
    end

    test "pressing start twice reuses the unfinished result rather than opening a second" do
      2.times do
        post assessments.start_assessment_path(@assessment), headers: { "Accept" => TURBO_ACCEPT }
        assert_response :see_other
      end

      assert_equal 1, AssessmentResult.where(user: @user, assessment: @assessment).count
    end

    test "a plain HTML request redirects the same way" do
      post assessments.start_assessment_path(@assessment), headers: { "Accept" => "text/html" }

      assert_response :see_other
      assert_redirected_to assessments.take_assessment_path(@assessment)
    end

    # The GET half. A GET must never create — otherwise every refresh, prefetch
    # and back-button hands out another AssessmentResult.
    test "the exam page is a GET that creates nothing" do
      post assessments.start_assessment_path(@assessment), headers: { "Accept" => TURBO_ACCEPT }
      assert_equal 1, AssessmentResult.where(user: @user, assessment: @assessment).count

      assert_no_difference -> { AssessmentResult.where(user: @user, assessment: @assessment).count } do
        3.times { get assessments.take_assessment_path(@assessment) }
      end
      assert_response :success
    end

    test "the exam page sends a student who has not started back to the intro" do
      get assessments.take_assessment_path(@assessment)

      assert_redirected_to assessments.assessment_path(@assessment)
      assert_equal 0, AssessmentResult.where(user: @user, assessment: @assessment).count
    end

    # The before_action chain walks assessment -> route_step -> learning_route ->
    # learning_profile on EVERY request here. It was a bare `find`, so all three
    # hops were lazy — a strict-loading violation that only logs in production and
    # so had been an N+1 on every exam page rather than a visible failure.
    test "the exam page loads without a strict-loading violation" do
      assert_nothing_raised do
        get assessments.assessment_path(@assessment)
      end
      assert_response :success
    end
  end
end
