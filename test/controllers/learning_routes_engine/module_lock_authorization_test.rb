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

  test "route page shows the free module and locked outline without paid content" do
    get learning_routes_engine.route_path(@route)

    assert_response :success
    assert_select "[data-route-module]", count: 2
    assert_select "[data-module-access='preview']"
    assert_select "[data-module-access='locked']", text: /Paid/
    assert_no_match(/NEVER-EXPOSE-PAID-BODY|NEVER-EXPOSE-ANSWER/, response.body)
  end

  test "journey and review index do not list paid-module steps" do
    @paid_step.update!(status: :completed, fsrs_next_review_at: 1.minute.ago)

    get learning_routes_engine.journey_route_path(@route)
    assert_response :success
    assert_not_includes response.body, "Secret lesson"

    get learning_routes_engine.reviews_path
    assert_response :success
    assert_not_includes response.body, "Secret lesson"
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

  # Cross-format direct-request controls. The negative half repeats what test 1
  # already proves (locked -> 403 for every format the client might request).
  # The positive half is what makes that meaningful: the SAME requests, against
  # the SAME step, must stop being refused once a verified purchase exists —
  # proving the lock is entitlement-driven, not a permanently closed gate that
  # merely happens to answer 403 today.
  test "a locked step is refused for HTML, JSON and Turbo Stream, and stops being refused once paid" do
    requests = {
      html: -> { get learning_routes_engine.route_step_path(@route, @paid_step) },
      json: -> { get learning_routes_engine.route_step_path(@route, @paid_step), as: :json },
      turbo_stream: lambda {
        get learning_routes_engine.route_step_path(@route, @paid_step),
          headers: { "Accept" => "text/vnd.turbo-stream.html" }
      }
    }

    requests.each_value do |request|
      request.call
      assert_response :forbidden
      assert_empty response.body
    end

    pay_for_route!(@route)

    # HTML: the step actually renders, proving the paid body is genuinely
    # readable now, not merely "not 403".
    requests[:html].call
    assert_response :success
    assert_includes response.body, "NEVER-EXPOSE-PAID-BODY"
    # The answer key is never rendered to anyone, paid or not — payment
    # entitles the lesson body, never the quiz's own answer key.
    assert_not_includes response.body, "NEVER-EXPOSE-ANSWER"

    # JSON and Turbo Stream have no dedicated `show` template in this app, so a
    # paid request lands on ActionController::UnknownFormat (406) rather than a
    # rendered body — but the authorization gate itself, which is what this
    # task changes, no longer fires: it is a content-negotiation failure, not
    # the security 403 it was before payment. (Not asserting on response.body
    # here — Rails' own exception page for an unhandled UnknownFormat dumps a
    # source backtrace in the test environment, which is framework noise, not
    # application content.)
    [:json, :turbo_stream].each do |format|
      requests[format].call
      assert_not response.forbidden?, "expected #{format} to stop being refused after payment"
    end
  end

  private

  def pay_for_route!(route)
    quote = Commerce::RouteQuote.create_snapshot!(
      user: @user, learning_route: route, currency: "USD",
      total_module_count: 2, paid_module_count: 1,
      estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40,
      markup_basis_points: Commerce::PricingConstants::MARKUP_BASIS_POINTS,
      minimum_price_per_paid_module_cents: Commerce::PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS,
      cost_based_price_cents: 210, minimum_price_cents: 299, final_price_cents: 299,
      estimator_version: "wp18-v1", provider_rate_versions: { "gpt-5.2" => "2026-08-31" },
      fee_version: "ls-test-v1", image_quality: "medium",
      route_shape_assumptions: { "outline" => [] }, provider_rate_assumptions: { "gpt-5.2" => {} },
      fee_assumptions: { "version" => "ls-test-v1" }, expires_at: 24.hours.from_now
    )
    Commerce::RoutePurchase.create!(
      user: @user, learning_route: route, route_quote: quote, state: "pending",
      provider: "lemon_squeezy", test_mode: true, amount_cents: 299, currency: "USD",
      estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40
    ).mark_paid!(order_id: "ord_#{SecureRandom.hex(3)}", actual_fee_cents: 45, paid_at: Time.current)
  end
end
