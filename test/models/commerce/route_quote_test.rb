require "test_helper"

module Commerce
  class RouteQuoteTest < ActiveSupport::TestCase
    setup do
      @user = create_test_user
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "Pricing")
    end

    test "stores an immutable integer pricing snapshot" do
      quote = RouteQuote.create!(valid_attributes)

      assert_equal "USD", quote.currency
      assert_equal 5000, quote.markup_basis_points
      assert_equal 299, quote.minimum_price_per_paid_module_cents
      assert_equal 598, quote.minimum_price_cents
      assert_equal 700, quote.final_price_cents
      assert_equal({ "quality" => "medium" }, quote.route_shape_assumptions)

      assert_not quote.update(final_price_cents: 701)
      assert_includes quote.errors[:base], "pricing snapshots are immutable"
      quote.reload
      assert quote.update(superseded_at: Time.current)
    end

    test "validates ownership counts constants formulas and required versions" do
      invalid = RouteQuote.new(valid_attributes.merge(
        currency: "CRC", total_module_count: 0, paid_module_count: 3,
        markup_basis_points: 1, minimum_price_per_paid_module_cents: 1,
        minimum_price_cents: 1, final_price_cents: 1,
        estimator_version: nil, provider_rate_versions: {}, fee_version: nil
      ))

      assert_not invalid.valid?
      assert invalid.errors[:currency].any?
      assert invalid.errors[:total_module_count].any?
      assert invalid.errors[:paid_module_count].any?
      assert invalid.errors[:markup_basis_points].any?
      assert invalid.errors[:minimum_price_per_paid_module_cents].any?
      assert invalid.errors[:minimum_price_cents].any?
      assert invalid.errors[:final_price_cents].any?
      assert invalid.errors[:estimator_version].any?
      assert invalid.errors[:provider_rate_versions].any?
      assert invalid.errors[:fee_version].any?
    end

    test "replacement supersedes only the prior unattached active quote" do
      first = RouteQuote.create_snapshot!(valid_attributes)
      second = RouteQuote.create_snapshot!(valid_attributes.merge(final_price_cents: 750,
        cost_based_price_cents: 750))

      assert_not_nil first.reload.superseded_at
      assert_nil second.superseded_at

      first.update!(attachment_state: "checkout")
      third = RouteQuote.create_snapshot!(valid_attributes.merge(final_price_cents: 800,
        cost_based_price_cents: 800))

      assert_equal "checkout", first.reload.attachment_state
      assert_nil third.superseded_at
    end

    test "user association does not expose another user's quote" do
      quote = RouteQuote.create!(valid_attributes)
      other = create_test_user

      assert_equal [quote.id], @user.route_quotes.pluck(:id)
      assert_empty other.route_quotes
    end

    test "application validation rejects another user's route" do
      other = create_test_user
      quote = RouteQuote.new(valid_attributes.merge(user: other))

      assert_not quote.valid?
      assert_includes quote.errors[:user], "must own the learning route"
    end

    test "a one-module route has no paid modules and a zero minimum" do
      quote = RouteQuote.create!(valid_attributes.merge(
        total_module_count: 1, paid_module_count: 0, minimum_price_cents: 0
      ))

      assert_equal 0, quote.paid_module_count
      assert_equal 0, quote.minimum_price_cents
      assert_equal 700, quote.final_price_cents
    end

    test "an expired snapshot is invalid" do
      quote = RouteQuote.new(valid_attributes.merge(expires_at: 1.minute.ago))

      assert_not quote.valid?
      assert_includes quote.errors[:expires_at], "must be in the future"
    end

    private

    def valid_attributes
      {
        user: @user,
        learning_route: @route,
        currency: "USD",
        total_module_count: 3,
        paid_module_count: 2,
        estimated_ai_cost_microcents: 1_000_000,
        estimated_fee_cents: 100,
        markup_basis_points: 5000,
        minimum_price_per_paid_module_cents: 299,
        cost_based_price_cents: 700,
        minimum_price_cents: 598,
        final_price_cents: 700,
        estimator_version: "route-cost-v1",
        provider_rate_versions: { "openai" => "2026-08-01" },
        fee_version: "configured-v1",
        image_quality: "medium",
        route_shape_assumptions: { "quality" => "medium" },
        provider_rate_assumptions: { "openai" => { "version" => "2026-08-01" } },
        fee_assumptions: { "percentage_basis_points" => 500, "fixed_cents" => 50 },
        expires_at: 1.day.from_now
      }
    end
  end
end
