require "test_helper"

class WizardRouteQuoteTest < ActiveJob::TestCase
  # Quoting must be attempted for every generated route, and its failure must
  # leave a usable route with an explicit reason rather than a half-built one.
  def build_request
    user = Core::User.create!(
      name: "Wiz", email: "wiz-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "en"
    )
    RouteRequest.create!(user: user, topics: ["math"], level: "beginner", pace: "steady",
                         weekly_hours: 3, session_minutes: 30, status: "pending")
  end

  # strict_loading_by_default is on; the job assigns request.learning_route
  # itself and never lazily traverses it, but reloading the record for
  # assertions here would otherwise trip the guard on this one read.
  def reload_for_assertions(record)
    record.reload.tap { |r| r.strict_loading!(false) }
  end

  test "absent configuration records the block reason and still leaves a usable route" do
    request = build_request

    WizardRouteGenerationJob.perform_now(request.id)

    route = reload_for_assertions(request).learning_route
    assert route.present?, "the route must survive a quoting failure"
    assert_equal "estimator_configuration_missing", route.generation_params["quote_blocked_reason"]
    assert_equal 0, Commerce::RouteQuote.where(learning_route_id: route.id).count
    assert LearningRoutesEngine::RouteModule.exists?(learning_route_id: route.id, access_state: :preview)
  end

  test "a route is quoted once when estimator and fee configuration are both available" do
    request = build_request

    with_commerce_configuration do
      WizardRouteGenerationJob.perform_now(request.id)
    end

    route = reload_for_assertions(request).learning_route
    quotes = Commerce::RouteQuote.where(learning_route_id: route.id)
    if LearningRoutesEngine::RouteModule.where(learning_route_id: route.id).count == 1
      # A single-module route is entirely free; the spec forbids inventing a sale.
      assert_equal 0, quotes.count
      assert_equal "no_paid_modules", route.generation_params["quote_blocked_reason"]
    else
      assert_equal 1, quotes.count
      assert_nil route.generation_params["quote_blocked_reason"]
      assert_equal "unattached", quotes.first.attachment_state
    end
  end

  private

  def with_commerce_configuration
    estimator = {
      estimator_version: "wp18-v1", image_quality: "medium",
      outline: [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                  "input_tokens" => 2_000, "output_tokens" => 4_000 }],
      step_calls: {
        "lesson" => [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                       "input_tokens" => 3_000, "output_tokens" => 6_000 }],
        "exercise" => [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                         "input_tokens" => 1_000, "output_tokens" => 2_000 }],
        "assessment" => [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                           "input_tokens" => 1_000, "output_tokens" => 2_000 }],
        "review" => [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                       "input_tokens" => 500, "output_tokens" => 1_000 }]
      },
      provider_versions: { "gpt-5.2" => "2026-08-31" },
      tavily: { microcents_per_credit: 80, version: "2026-08-31" }
    }
    fee = { percentage_basis_points: 500, fixed_cents: 50, version: "ls-test-v1" }

    previous_estimator = Rails.application.config.x.commerce_estimator
    previous_fee = Rails.application.config.x.commerce_fee_configuration
    Rails.application.config.x.commerce_estimator = estimator
    Rails.application.config.x.commerce_fee_configuration = fee
    yield
  ensure
    Rails.application.config.x.commerce_estimator = previous_estimator
    Rails.application.config.x.commerce_fee_configuration = previous_fee
  end
end
