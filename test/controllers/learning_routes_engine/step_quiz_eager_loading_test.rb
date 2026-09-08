require "test_helper"

# Found by driving `POST complete` against the development server, not by the
# suite — which is the point of this file.
#
# `steps#complete` line 51 asks `@step.quiz_passed_by?(current_user)`, which
# walks the `step_quiz` has_one. `set_route_and_step` loads the step with
# `@route.route_steps.find(...)` and no `includes`, so that traversal is a lazy
# load on a strict_loading record.
#
# THE SUITE CANNOT SEE IT. `config/environments/test.rb` sets
# `strict_loading_mode = :all` believing it to be the stricter setting, and its
# comment says so. For this association it is the LOOSER one: under `:all` the
# traversal is allowed, and under the `:n_plus_one_only` that development and
# production actually run it raises. Verified both ways against the same code.
#
#   development / n_plus_one_only -> RAISED
#   test        / all             -> NO violation
#
# So in development every lesson and exercise completion is a 500, and in
# production — where the violation is configured to `:log` — it is a silent N+1
# on the busiest write path in the app.
#
# This test pins the environment the app is DEPLOYED in, not the one the suite
# happens to use.
module LearningRoutesEngine
  class StepQuizEagerLoadingTest < ActionDispatch::IntegrationTest
    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(
        learning_profile: profile, topic: "Eager", locale: "es", status: :active
      )
      @preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    test "completing a lesson does not lazily load the step quiz" do
      step = build_step(:lesson)
      quiz = Assessments::Assessment.create!(
        route_step: step, assessment_type: :step_quiz, passing_score: 80
      )
      Assessments::AssessmentResult.create!(user: @user, assessment: quiz, score: 100)

      in_deployed_strict_loading_mode do
        post learning_routes_engine.complete_route_step_path(@route, step), as: :json
      end

      assert_response :success,
        "the step quiz was lazily loaded on a strict_loading record: a 500 in " \
        "development and a logged N+1 in production"
      assert_equal "completed", step.reload.status
    end

    test "an exercise refused for its unpassed quiz does not lazily load it either" do
      step = build_step(:exercise)
      Assessments::Assessment.create!(
        route_step: step, assessment_type: :step_quiz, passing_score: 80
      )

      in_deployed_strict_loading_mode do
        post learning_routes_engine.complete_route_step_path(@route, step), as: :json
      end

      assert_response :unprocessable_entity
      assert_equal "in_progress", step.reload.status
    end

    test "viewing a lesson step does not lazily load the step quiz" do
      step = build_step(:lesson)
      Assessments::Assessment.create!(
        route_step: step, assessment_type: :step_quiz, passing_score: 80
      )

      in_deployed_strict_loading_mode do
        get learning_routes_engine.route_step_path(@route, step)
      end

      assert_response :success
    end

    # The SAME shape one controller over, and squarely on the path WP-35 §3
    # opened: an exercise now gates on its step quiz, so the student who cannot
    # continue is sent here to take it.
    test "submitting a step quiz does not lazily load it" do
      step = build_step(:lesson)
      quiz = Assessments::Assessment.create!(
        route_step: step, assessment_type: :step_quiz, passing_score: 80
      )
      question = Assessments::Question.create!(
        assessment: quiz, body: "¿Y bien?", question_type: :multiple_choice,
        options: ["A) si", "B) no"], correct_answer: "A", difficulty: 1, bloom_level: 1
      )

      in_deployed_strict_loading_mode do
        post learning_routes_engine.submit_route_step_step_quiz_path(@route, step),
             params: { answers: { question.id => "A) si" } },
             headers: { "Accept" => "text/vnd.turbo-stream.html" }
      end

      assert_response :success,
        "the step quiz was lazily loaded on a strict_loading record"
      assert_equal "completed", step.reload.status, "a passed quiz completes the step"
    end

    test "polling a step quiz's status does not lazily load it" do
      step = build_step(:lesson)
      Assessments::Assessment.create!(
        route_step: step, assessment_type: :step_quiz, passing_score: 80
      )

      in_deployed_strict_loading_mode do
        get learning_routes_engine.check_status_route_step_step_quiz_path(@route, step),
            headers: { "Accept" => "text/vnd.turbo-stream.html" }
      end

      assert_response :success,
        "the step quiz was lazily loaded on a strict_loading record"
    end

    private

    def build_step(content_type)
      @position = (@position || -1) + 1
      @route.route_steps.create!(
        route_module: @preview, title: "Paso", position: @position, status: :in_progress,
        content_type: content_type, level: :nv1, bloom_level: 1
      )
    end

    # `:n_plus_one_only` is what development.rb and production.rb both set. The
    # suite's `:all` lets this association through, so asserting under the suite's
    # own mode would prove nothing.
    def in_deployed_strict_loading_mode
      previous = ActiveRecord::Base.strict_loading_mode
      ActiveRecord::Base.strict_loading_mode = :n_plus_one_only
      yield
    ensure
      ActiveRecord::Base.strict_loading_mode = previous
    end
  end
end
