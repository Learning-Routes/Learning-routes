require "test_helper"

module Commerce
  class WebhooksTest < ActionDispatch::IntegrationTest
    def setup
      @user = create_test_user(email_verified_at: Time.current)
      @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: @profile, topic: "AWS", locale: "en", status: :active
      )
      @paid_module = LearningRoutesEngine::RouteModule.create!(
        learning_route: @route, position: 2, title: "Paid", access_state: :locked, generation_state: :outlined
      )
      @paid_step = LearningRoutesEngine::RouteStep.create!(
        learning_route: @route, route_module: @paid_module, position: 1, title: "Paid step"
      )
      @quote = Commerce::RouteQuote.create_snapshot!(
        user: @user, learning_route: @route, currency: "USD",
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

      # Same setup needed on both sides of the webhook: PaymentProvider.resolve
      # must hand the controller the Fake adapter (so signature verification
      # never touches the network), AND `PaymentProvider.configuration` — read
      # directly by OrderProcessor to validate store/mode — must agree with
      # that same Fake's defaults (store_id "1", test_mode true). Neither is
      # present by default in the test environment.
      adapter = fake
      @original_resolve = Commerce::PaymentProvider.method(:resolve)
      Commerce::PaymentProvider.define_singleton_method(:resolve) do |**|
        Commerce::PaymentProvider::Available.new(adapter: adapter)
      end
      @original_provider_config = Rails.application.config.x.commerce_payment_provider
      Rails.application.config.x.commerce_payment_provider = {
        api_key: "key", signing_secret: "fake_secret", store_id: "1",
        product_id: "2", variant_id: "3", test_mode: true
      }
    end

    def teardown
      Commerce::PaymentProvider.define_singleton_method(:resolve, @original_resolve)
      Rails.application.config.x.commerce_payment_provider = @original_provider_config
    end

    def fake = @fake ||= Commerce::Providers::Fake.new

    def valid_body
      {
        meta: {
          event_name: "order_created",
          custom_data: { route_id: @route.id, quote_id: @quote.id, user_id: @user.id }
        },
        data: {
          id: "ord_1",
          attributes: {
            store_id: "1", identifier: "chk_#{@quote.id}", total: 299,
            currency: "USD", fee: 45, refunded_amount: 0, status: "paid", test_mode: true
          }
        }
      }.to_json
    end

    test "an unsigned delivery is unauthorized and writes nothing" do
      post commerce_lemon_squeezy_webhook_path, params: valid_body, headers: { "CONTENT_TYPE" => "application/json" }

      assert_response :unauthorized
      assert_equal 0, Commerce::ProviderEvent.count
      assert_equal 0, Commerce::RoutePurchase.paid.count
    end

    test "a body mutated after signing is unauthorized" do
      body = valid_body
      signature = fake.sign(body)
      tampered = body.sub('"total":299', '"total":1')

      post commerce_lemon_squeezy_webhook_path, params: tampered,
           headers: { "CONTENT_TYPE" => "application/json", "X-Signature" => signature }

      assert_response :unauthorized
      assert_equal 0, Commerce::RoutePurchase.paid.count
    end

    test "a correctly signed order marks the purchase paid" do
      body = valid_body

      post commerce_lemon_squeezy_webhook_path, params: body,
           headers: { "CONTENT_TYPE" => "application/json", "X-Signature" => fake.sign(body) }

      assert_response :ok
      assert_equal 1, Commerce::RoutePurchase.paid.count
    end

    test "the same signed delivery twice pays once" do
      body = valid_body
      2.times do
        post commerce_lemon_squeezy_webhook_path, params: body,
             headers: { "CONTENT_TYPE" => "application/json", "X-Signature" => fake.sign(body) }
      end

      assert_equal 1, Commerce::RoutePurchase.paid.count
      assert_equal 1, Commerce::ProviderEvent.count
    end

    test "no response body ever leaks a record id, a reason or a secret" do
      body = valid_body
      post commerce_lemon_squeezy_webhook_path, params: body,
           headers: { "CONTENT_TYPE" => "application/json", "X-Signature" => fake.sign(body) }

      assert_empty response.body.strip
    end

    test "a success redirect alone never unlocks content" do
      # The customer returns from the provider with no webhook delivered.
      sign_in_as(@user)
      get learning_routes_engine.route_path(@route, purchase: "pending")

      assert_response :success
      assert_equal 0, Commerce::RoutePurchase.paid.count
      assert_not LearningRoutesEngine::ModuleAccessPolicy.allowed_step?(user: @user, step_id: @paid_step.id)
    end
  end
end
