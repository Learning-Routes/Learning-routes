require "test_helper"

module Commerce
  class CheckoutsTest < ActionDispatch::IntegrationTest
    def setup
      @user = create_test_user(email_verified_at: Time.current)
      @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: @profile, topic: "AWS", locale: "en", status: :active
      )
      LearningRoutesEngine::RouteModule.create!(
        learning_route: @route, position: 2, title: "Paid", access_state: :locked, generation_state: :outlined
      )
    end

    def build_quote(user: @user, route: @route)
      Commerce::RouteQuote.create_snapshot!(
        user: user, learning_route: route, currency: "USD",
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
    end

    # No PaymentProvider configuration is present in the test environment, so
    # PaymentProvider.resolve is Unavailable by default. minitest/mock's #stub is
    # not available in this bundle; earlier tasks swap the singleton method
    # directly and restore it in an `ensure` block, so this follows that pattern.
    def with_fake_provider
      original = Commerce::PaymentProvider.method(:resolve)
      Commerce::PaymentProvider.define_singleton_method(:resolve) do |**|
        Commerce::PaymentProvider::Available.new(adapter: Commerce::Providers::Fake.new)
      end
      yield
    ensure
      Commerce::PaymentProvider.define_singleton_method(:resolve, original)
    end

    test "a signed-out request is sent to sign in and creates nothing" do
      post commerce_route_checkout_path(@route.id)

      assert_redirected_to core.sign_in_path
      assert_equal 0, Commerce::RoutePurchase.count
    end

    test "another user's route is indistinguishable from one that does not exist" do
      sign_in_as(@user)
      stranger = create_test_user
      stranger_profile = LearningRoutesEngine::LearningProfile.create!(user: stranger, current_level: "beginner")
      stranger_route = LearningRoutesEngine::LearningRoute.create!(learning_profile: stranger_profile, topic: "Other")

      with_fake_provider { post commerce_route_checkout_path(stranger_route.id) }
      assert_response :not_found
      not_owned_body = response.body

      post commerce_route_checkout_path(SecureRandom.uuid)
      assert_response :not_found
      assert_equal not_owned_body, response.body
      assert_equal 0, Commerce::RoutePurchase.count
    end

    test "a route with no quote is rejected as unprocessable with the localized message" do
      sign_in_as(@user)

      with_fake_provider do
        post commerce_route_checkout_path(@route.id), as: :json
        assert_response :unprocessable_entity
        assert_equal "no_quote", JSON.parse(response.body)["error"]

        post commerce_route_checkout_path(@route.id)
        assert_response :see_other
        assert_equal I18n.t("commerce.checkout.no_quote"), flash[:alert]
      end
      assert_equal 0, Commerce::RoutePurchase.count
    end

    test "the happy path redirects to the provider checkout and attaches the quote" do
      sign_in_as(@user)
      quote = build_quote

      with_fake_provider { post commerce_route_checkout_path(@route.id) }

      assert_response :see_other
      assert_equal "https://example.test/checkout/#{quote.id}", response.location
      assert_equal "checkout", quote.reload.attachment_state
      assert_equal 1, Commerce::RoutePurchase.count
      assert_equal quote.final_price_cents, Commerce::RoutePurchase.last.amount_cents
    end

    test "a repeat purchase of an already-paid route is rejected" do
      sign_in_as(@user)
      build_quote

      with_fake_provider { post commerce_route_checkout_path(@route.id) }
      assert_response :see_other
      Commerce::RoutePurchase.last.mark_paid!(order_id: "ord_1", actual_fee_cents: 1, paid_at: Time.current)

      with_fake_provider { post commerce_route_checkout_path(@route.id), as: :json }

      assert_response :unprocessable_entity
      assert_equal "already_purchased", JSON.parse(response.body)["error"]
      assert_equal 1, Commerce::RoutePurchase.count
    end
  end
end
