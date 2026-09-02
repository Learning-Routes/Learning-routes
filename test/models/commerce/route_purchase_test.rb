require "test_helper"

class Commerce::RoutePurchaseTest < ActiveSupport::TestCase
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
    Commerce::RouteQuote.create_snapshot!(
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
  end

  def build_purchase(**overrides)
    Commerce::RoutePurchase.new({
      user: @user, learning_route: @route, route_quote: @quote,
      state: "pending", provider: "lemon_squeezy", test_mode: true,
      provider_checkout_id: "chk_#{SecureRandom.hex(4)}",
      amount_cents: @quote.final_price_cents, currency: "USD",
      estimated_ai_cost_microcents: @quote.estimated_ai_cost_microcents,
      estimated_fee_cents: @quote.estimated_fee_cents
    }.merge(overrides))
  end

  test "a pending purchase copies amount and currency from its quote" do
    purchase = build_purchase
    assert purchase.save, purchase.errors.full_messages.inspect
    assert_equal 299, purchase.amount_cents
    assert_equal "USD", purchase.currency
    assert_not purchase.paid?
  end

  test "an amount that disagrees with the quote is rejected" do
    purchase = build_purchase(amount_cents: 298)
    assert_not purchase.valid?
    assert_includes purchase.errors[:amount_cents].join, "quote"
  end

  test "a purchase whose user does not own the route is rejected" do
    stranger = Core::User.create!(
      name: "Other", email: "other-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    purchase = build_purchase(user: stranger)
    assert_not purchase.valid?
    assert_includes purchase.errors[:user].join, "own"
  end

  test "mark_paid! records the order, the actual fee and the timestamp" do
    purchase = build_purchase
    purchase.save!
    paid_at = Time.current

    purchase.mark_paid!(order_id: "ord_1", actual_fee_cents: 45, paid_at: paid_at)

    assert purchase.reload.paid?
    assert_equal "ord_1", purchase.provider_order_id
    assert_equal 45, purchase.actual_fee_cents
    assert_in_delta paid_at.to_i, purchase.paid_at.to_i, 1
  end

  test "only one PAID purchase may exist per route, while failed attempts may repeat" do
    build_purchase.tap(&:save!).mark_paid!(order_id: "ord_1", actual_fee_cents: 1, paid_at: Time.current)

    second = build_purchase(provider_checkout_id: "chk_second")
    second.save!
    assert_raises(ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid) do
      second.mark_paid!(order_id: "ord_2", actual_fee_cents: 1, paid_at: Time.current)
    end

    third = build_purchase(provider_checkout_id: "chk_third", state: "failed")
    assert third.save, "a failed attempt must not collide with a paid purchase"
  end

  test "entitled? is true only for a route with a paid purchase" do
    assert_not Commerce::RoutePurchase.entitled?(route_id: @route.id)
    purchase = build_purchase
    purchase.save!
    assert_not Commerce::RoutePurchase.entitled?(route_id: @route.id), "pending is not entitlement"

    purchase.mark_paid!(order_id: "ord_1", actual_fee_cents: 1, paid_at: Time.current)
    assert Commerce::RoutePurchase.entitled?(route_id: @route.id)
  end

  test "a refund records the amount and timestamp without deleting the entitlement row" do
    purchase = build_purchase
    purchase.save!
    purchase.mark_paid!(order_id: "ord_1", actual_fee_cents: 1, paid_at: Time.current)

    purchase.mark_refunded!(refunded_amount_cents: 299, refunded_at: Time.current)

    assert_equal "refunded", purchase.reload.state
    assert_equal 299, purchase.refunded_amount_cents
    assert purchase.refunded_at.present?
  end

  test "money columns reject negatives" do
    assert_not build_purchase(amount_cents: -1).valid?
  end
end
