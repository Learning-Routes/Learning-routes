require "test_helper"

module Commerce
  class CheckoutCreatorTest < ActiveSupport::TestCase
    def setup
      @user = Core::User.create!(
        name: "Buyer", email: "buy-#{SecureRandom.hex(4)}@example.com",
        password: "password123", password_confirmation: "password123",
        email_verified_at: Time.current
      )
      @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: @profile, topic: "AWS", locale: "en", status: :active
      )
      LearningRoutesEngine::RouteModule.create!(
        learning_route: @route, position: 2, title: "Paid", access_state: :locked, generation_state: :outlined
      )
      @quote = build_quote
    end

    def build_quote
      Commerce::RouteQuote.create_snapshot!(quote_attributes(expires_at: 24.hours.from_now))
    end

    def quote_attributes(expires_at:, created_at: nil)
      {
        user: @user, learning_route: @route, currency: "USD",
        total_module_count: 2, paid_module_count: 1,
        estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40,
        markup_basis_points: Commerce::PricingConstants::MARKUP_BASIS_POINTS,
        minimum_price_per_paid_module_cents: Commerce::PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS,
        cost_based_price_cents: 210, minimum_price_cents: 299, final_price_cents: 299,
        estimator_version: "wp18-v1", provider_rate_versions: { "gpt-5.2" => "2026-08-31" },
        fee_version: "ls-test-v1", image_quality: "medium",
        route_shape_assumptions: { "outline" => [] }, provider_rate_assumptions: { "gpt-5.2" => {} },
        fee_assumptions: { "version" => "ls-test-v1" }, expires_at: expires_at
      }.tap { |attrs| attrs[:created_at] = created_at if created_at }
    end

    def adapter = @adapter ||= Commerce::Providers::Fake.new

    def create(user: @user, route: @route)
      Commerce::CheckoutCreator.call(
        user: user, route: route, adapter: adapter,
        success_url: "https://example.test/ok", cancel_url: "https://example.test/no"
      )
    end

    test "it charges exactly the quote's final price and attaches the quote" do
      result = create

      assert result.created?, result.try(:reason)
      assert_equal @quote.final_price_cents, result.purchase.amount_cents
      assert_equal @quote.final_price_cents, adapter.created_checkouts.first[:amount_cents]
      assert_equal "pending", result.purchase.state
      assert_equal "checkout", @quote.reload.attachment_state
    end

    test "an attached quote can never be superseded by a replacement" do
      create
      replacement = build_quote

      assert_equal "checkout", @quote.reload.attachment_state
      assert_nil @quote.superseded_at, "an attached quote must survive a replacement untouched"
      assert_equal "unattached", replacement.attachment_state
    end

    test "a route belonging to someone else is rejected without creating anything" do
      stranger = Core::User.create!(
        name: "Nope", email: "nope-#{SecureRandom.hex(4)}@example.com",
        password: "password123", password_confirmation: "password123",
        email_verified_at: Time.current
      )

      result = create(user: stranger)

      assert_not result.created?
      assert_equal "not_owner", result.reason
      assert_equal 0, Commerce::RoutePurchase.count
    end

    test "an expired quote with no way to re-price reports that it could not be priced" do
      # `commerce_route_quotes_immutable_guard` blocks ANY change to expires_at on
      # UPDATE (that is the point of the trigger), so an already-persisted quote can
      # never be pushed into the past with update_column. Simulate a quote whose
      # validity window has already elapsed by inserting one directly with a
      # created_at far enough in the past that expires_at (in the past) is still
      # after created_at, satisfying route_quotes_future_expiration.
      @quote.destroy!
      Commerce::RouteQuote.new(quote_attributes(expires_at: 1.hour.ago, created_at: 2.days.ago))
                          .save!(validate: false)

      result = create

      assert_not result.created?
      # No estimator configuration exists in the test environment, so the
      # re-quote fails closed. The customer is told the truth — we could not
      # work out a price — instead of the old "refresh the page to get a new
      # one", which nothing would ever have produced.
      assert_equal "pricing_unavailable", result.reason
      assert_equal 0, Commerce::RoutePurchase.count
    end

    test "a route that is already paid for cannot be bought twice" do
      first = create
      first.purchase.mark_paid!(order_id: "ord_1", actual_fee_cents: 1, paid_at: Time.current)

      result = create

      assert_not result.created?
      assert_equal "already_purchased", result.reason
    end

    test "a provider failure leaves the quote unattached and creates no purchase" do
      failing = Object.new
      def failing.name = "lemon_squeezy"
      def failing.create_checkout(**) = raise(Commerce::PaymentProvider::Error, "boom")

      result = Commerce::CheckoutCreator.call(
        user: @user, route: @route, adapter: failing,
        success_url: "https://example.test/ok", cancel_url: "https://example.test/no"
      )

      assert_not result.created?
      assert_equal "provider_error", result.reason
      assert_equal "unattached", @quote.reload.attachment_state
      assert_equal 0, Commerce::RoutePurchase.count
    end

    test "a failure inside the transaction rolls back and leaves the quote unattached" do
      original = Commerce::RoutePurchase.method(:create!)
      Commerce::RoutePurchase.define_singleton_method(:create!) do |*|
        raise ActiveRecord::RecordInvalid, Commerce::RoutePurchase.new
      end

      result = begin
        create
      ensure
        Commerce::RoutePurchase.define_singleton_method(:create!, original)
      end

      assert_not result.created?
      assert_equal "checkout_error", result.reason
      assert_equal "unattached", @quote.reload.attachment_state
      assert_equal 0, Commerce::RoutePurchase.count
    end
  end
end
