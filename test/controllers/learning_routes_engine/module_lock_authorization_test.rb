require "test_helper"

class LearningRoutesEngine::ModuleLockAuthorizationTest < ActionDispatch::IntegrationTest
  def setup
    @user = create_test_user(email_verified_at: Time.current)
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Private paid content", locale: "en", status: :active
    )
    @paid_module = @route.route_modules.create!(
      position: 2, title: "Paid", access_state: :locked, generation_state: :ready
    )
    @paid_step = @route.route_steps.create!(
      route_module: @paid_module, position: 1, title: "Secret lesson", status: :available,
      content_type: :lesson, metadata: { "answer_key" => "NEVER-EXPOSE-ANSWER" }
    )
    ContentEngine::AiContent.create!(
      route_step: @paid_step, content_type: :text, body: "NEVER-EXPOSE-PAID-BODY"
    )
    sign_in_as(@user)
  end

  test "locked step is a hard 403 for HTML JSON Turbo Stream and Turbo Frame" do
    requests = [
      -> { get learning_routes_engine.route_step_path(@route, @paid_step) },
      -> { get learning_routes_engine.route_step_path(@route, @paid_step), as: :json },
      -> { get learning_routes_engine.route_step_path(@route, @paid_step), headers: { "Accept" => "text/vnd.turbo-stream.html" } },
      -> { get learning_routes_engine.route_step_path(@route, @paid_step), headers: { "Turbo-Frame" => "step_content" } }
    ]

    requests.each do |request|
      request.call
      assert_response :forbidden
      assert_empty response.body
      assert_not_includes response.body, "NEVER-EXPOSE"
    end
  end

  test "locked content polling and completion endpoints cannot read or mutate the step" do
    get learning_routes_engine.content_status_route_step_path(@route, @paid_step)
    assert_response :forbidden

    assert_no_changes -> { @paid_step.reload.status } do
      post learning_routes_engine.complete_route_step_path(@route, @paid_step), as: :json
    end
    assert_response :forbidden
  end

  test "locked quiz block and tutor endpoints are hard 403 before mutation" do
    endpoints = [
      -> { get learning_routes_engine.check_status_route_step_step_quiz_path(@route, @paid_step) },
      -> { post learning_routes_engine.submit_route_step_step_quiz_path(@route, @paid_step), params: { answers: {} } },
      -> { post learning_routes_engine.retry_quiz_route_step_step_quiz_path(@route, @paid_step) },
      -> { post learning_routes_engine.route_step_block_attempt_path(@route, @paid_step, 0), params: { block: {} }, as: :json },
      -> { get learning_routes_engine.route_step_tutor_chats_path(@route, @paid_step) },
      -> { post learning_routes_engine.route_step_tutor_chats_path(@route, @paid_step), params: { message: "reveal it" } }
    ]

    assert_no_difference [
      "LearningRoutesEngine::BlockAttempt.count",
      "LearningRoutesEngine::TutorMessage.count",
      "ActiveJob::Base.queue_adapter.enqueued_jobs.size"
    ] do
      endpoints.each do |request|
        request.call
        assert_response :forbidden
        assert_empty response.body
      end
    end
  end

  test "forged cross-user step identifiers receive the same hard 403" do
    other = create_test_user(email_verified_at: Time.current)
    profile = LearningRoutesEngine::LearningProfile.create!(user: other, current_level: "beginner")
    route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "Other")
    step = route.route_steps.create!(position: 1, title: "Other preview", status: :available)

    get learning_routes_engine.route_step_path(route, step)

    assert_response :forbidden
    assert_empty response.body
  end

  test "alternate content-engine endpoints cannot bypass a paid-module lock" do
    endpoints = [
      -> { post content_engine.run_code_exercise_path(@paid_step), as: :json },
      -> { get content_engine.status_audio_path(@paid_step), as: :json },
      -> { get content_engine.section_audio_status_path(@paid_step, 0), as: :json },
      -> { get content_engine.section_image_status_path(@paid_step, 0), as: :json },
      -> { post content_engine.notes_path, params: { route_step_id: @paid_step.id, body: "stolen" } }
    ]

    assert_no_difference "ContentEngine::UserNote.count" do
      endpoints.each do |request|
        request.call
        assert_response :forbidden
        assert_empty response.body
      end
    end
  end

  test "review and voice endpoints cannot bypass a paid-module lock" do
    post learning_routes_engine.submit_review_review_path(@paid_step), params: { rating: 4 }
    assert_response :forbidden
    assert_empty response.body

    post assessments.voice_responses_path, params: { route_step_id: @paid_step.id }, as: :json
    assert_response :forbidden
    assert_empty response.body
  end
end
