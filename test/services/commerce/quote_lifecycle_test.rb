require "test_helper"

module Commerce
  # The quote dead end, and the rules that replace it.
  #
  # `attach!` is one-way and `RouteQuoteBuilder` had exactly one caller — the
  # route-creation job. So a customer who opened a checkout and closed the tab
  # moved the only quote to `checkout` forever: every later attempt found no
  # unattached quote and was told the route had no price, permanently. Expiry
  # reached the same dead end from the other side.
  class QuoteLifecycleTest < ActiveSupport::TestCase
    def setup
      @user = Core::User.create!(
        name: "Buyer", email: "lifecycle-#{SecureRandom.hex(4)}@example.com",
        password: "password123", password_confirmation: "password123",
        email_verified_at: Time.current
      )
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: profile, topic: "AWS", locale: "en", status: :active
      )
      paid = LearningRoutesEngine::RouteModule.create!(
        learning_route: @route, position: 2, title: "Paid",
        access_state: :locked, generation_state: :outlined
      )
      # Real steps, so the estimator's per-step call shapes actually contribute.
      # Without them only the outline call is priced and every quote collapses to
      # the paid-module minimum, which would make the price tests pass for the
      # wrong reason.
      2.times do |index|
        @route.route_steps.create!(
          route_module: paid, position: index + 1, title: "Paid step #{index + 1}",
          status: :locked, content_type: :lesson
        )
      end
      @original_estimator = Rails.application.config.x.commerce_estimator
      @original_fees = Rails.application.config.x.commerce_fee_configuration
      configure_pricing!
    end

    def teardown
      Rails.application.config.x.commerce_estimator = @original_estimator
      Rails.application.config.x.commerce_fee_configuration = @original_fees
    end

    # ── resume an abandoned checkout ────────────────────────────────────────

    test "an abandoned checkout is resumed at the original price while unexpired" do
      first = create
      assert first.created?, first.try(:reason)
      original_quote_id = first.purchase.route_quote_id
      assert_equal "checkout", RouteQuote.find(original_quote_id).attachment_state

      # The customer closed the tab. Nothing was paid; they come back.
      second = create

      assert second.created?, second.try(:reason)
      assert_equal original_quote_id, second.purchase.route_quote_id,
        "a returning customer must resume the quote they were shown, not be re-priced"
      assert_equal first.purchase.amount_cents, second.purchase.amount_cents
    end

    test "resuming does not raise on the one-way attachment transition" do
      create
      # Before the guard, `attach!(\"checkout\")` on an already-`checkout` quote
      # raised ArgumentError, which the rescue reported to the customer as
      # `checkout_error` on the very path built to help them.
      result = create

      assert result.created?, result.try(:reason)
      assert_equal 2, RoutePurchase.where(learning_route_id: @route.id).count
    end

    # ── re-quote when there is nothing usable ───────────────────────────────

    test "a route with no quote at all is priced on demand" do
      RouteQuote.where(learning_route_id: @route.id).delete_all

      result = create

      assert result.created?, result.try(:reason)
      assert_equal 1, RouteQuote.where(learning_route_id: @route.id).count
      assert_operator result.purchase.amount_cents, :>, 0
    end

    test "an expired quote is replaced rather than becoming a dead end" do
      expired = expired_quote(final_price_cents: 299)

      result = create

      assert result.created?, result.try(:reason)
      assert_not_equal expired.id, result.purchase.route_quote_id
      assert_operator RouteQuote.find(result.purchase.route_quote_id).expires_at, :>, Time.current
    end

    # ── the price is never raised on someone who saw a lower one ────────────

    test "a higher re-quote does not raise the price the customer was already shown" do
      cheap = expired_quote(final_price_cents: 299)
      # Make the fresh quote genuinely more expensive than the one already shown.
      configure_pricing!(output_tokens: 40_000_000)

      result = create

      assert result.created?, result.try(:reason)
      assert_equal cheap.final_price_cents, result.purchase.amount_cents,
        "a customer shown 299 must not be re-priced upward inside the honour window"

      honoured = RouteQuote.find(result.purchase.route_quote_id)
      assert_not_equal cheap.id, honoured.id, "the expired snapshot must stay expired"
      assert_operator honoured.expires_at, :>, Time.current
    end

    test "a price shown outside the honour window does not bind us" do
      expired_quote(final_price_cents: 299, created_at: 400.days.ago, expires_at: 399.days.ago)
      configure_pricing!(output_tokens: 40_000_000)

      result = create

      assert result.created?, result.try(:reason)
      assert_operator result.purchase.amount_cents, :>, 299,
        "the honour window is bounded; a year-old price must not bind us forever"
    end

    test "a LOWER re-quote is passed on rather than held at the old higher price" do
      expired_quote(final_price_cents: 1_000, cost_based_price_cents: 1_000)
      configure_pricing!(output_tokens: 1)

      result = create

      assert result.created?, result.try(:reason)
      assert_operator result.purchase.amount_cents, :<, 1_000,
        "honouring the lower price must cut both ways"
    end

    private

    def create
      CheckoutCreator.call(
        user: @user, route: @route, adapter: Providers::Fake.new,
        success_url: "https://example.test/ok", cancel_url: "https://example.test/no"
      )
    end

    def configure_pricing!(output_tokens: 6_000)
      Rails.application.config.x.commerce_estimator = {
        estimator_version: "lifecycle-v1",
        image_quality: "medium",
        outline: [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                    "input_tokens" => 2_000, "output_tokens" => 4_000 }],
        step_calls: {
          "lesson" => [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                         "input_tokens" => 3_000, "output_tokens" => output_tokens }]
        },
        provider_versions: { "gpt-5.2" => "2026-08-31" },
        tavily: { microcents_per_credit: 80, version: "2026-08-31" }
      }
      Rails.application.config.x.commerce_fee_configuration = {
        percentage_basis_points: 500, fixed_cents: 50, version: "lifecycle-fee-v1"
      }
    end

    # `commerce_route_quotes_immutable_guard` blocks any change to expires_at on
    # UPDATE, so an expired quote has to be inserted already expired, with a
    # created_at early enough to satisfy route_quotes_future_expiration.
    def expired_quote(final_price_cents:, cost_based_price_cents: 210,
                      created_at: 2.days.ago, expires_at: 1.hour.ago)
      RouteQuote.where(learning_route_id: @route.id).delete_all
      quote = RouteQuote.new(
        user: @user, learning_route: @route, currency: "USD",
        total_module_count: 2, paid_module_count: 1,
        estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40,
        markup_basis_points: PricingConstants::MARKUP_BASIS_POINTS,
        minimum_price_per_paid_module_cents: PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS,
        cost_based_price_cents: cost_based_price_cents, minimum_price_cents: 299,
        final_price_cents: final_price_cents,
        estimator_version: "shown-v1", provider_rate_versions: { "gpt-5.2" => "2026-08-31" },
        fee_version: "shown-fee-v1", image_quality: "medium",
        route_shape_assumptions: { "outline" => [] }, provider_rate_assumptions: { "gpt-5.2" => {} },
        fee_assumptions: { "version" => "shown-fee-v1" },
        expires_at: expires_at, created_at: created_at
      )
      quote.save!(validate: false)
      quote
    end
  end
end
