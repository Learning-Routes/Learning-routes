require "test_helper"

class LearningRoutesEngine::ModuleEntitlementTest < ActiveSupport::TestCase
  Policy = LearningRoutesEngine::ModuleAccessPolicy

  def setup
    @user = Core::User.create!(
      name: "Owner", email: "own-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "AWS", locale: "en", status: :active
    )
    @preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
    @locked = LearningRoutesEngine::RouteModule.create!(
      learning_route: @route, position: 2, title: "Paid", access_state: :locked, generation_state: :outlined
    )
    @free_step = @route.route_steps.create!(
      route_module: @preview, position: 0, title: "Free", level: 1, bloom_level: 1,
      content_type: :lesson, delivery_format: "text", status: :available
    )
    @paid_step = @route.route_steps.create!(
      route_module: @locked, position: 1, title: "Paid", level: 1, bloom_level: 1,
      content_type: :lesson, delivery_format: "text", status: :locked
    )
  end

  test "before payment the preview is readable and the paid module is not" do
    assert Policy.allowed_step?(user: @user, step_id: @free_step.id)
    assert_not Policy.allowed_step?(user: @user, step_id: @paid_step.id)
  end

  test "a PENDING purchase entitles nothing" do
    create_purchase(state: "pending")
    assert_not Policy.allowed_step?(user: @user, step_id: @paid_step.id)
  end

  test "a paid purchase entitles every module of that route" do
    pay!
    assert Policy.allowed_step?(user: @user, step_id: @paid_step.id)
    assert Policy.allowed?(user: @user, route_id: @route.id, step_id: @paid_step.id)
  end

  test "entitlement never crosses to another user's route" do
    pay!
    stranger = Core::User.create!(
      name: "Str", email: "str-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    assert_not Policy.allowed_step?(user: stranger, step_id: @paid_step.id)
  end

  test "the owner role grants no entitlement to a route the owner does not own" do
    pay!
    owner = Core::User.create!(
      name: "Boss", email: "boss-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, role: :owner
    )
    assert_not Policy.allowed_step?(user: owner, step_id: @paid_step.id)
  end

  # The owner's decision: customer access follows LearningProfile ownership, so
  # the owner can use and buy their OWN routes. The role adds nothing.
  test "the owner may read their own route's preview and their own paid content" do
    @user.update!(role: :owner)
    assert Policy.allowed_step?(user: @user, step_id: @free_step.id)
    assert_not Policy.allowed_step?(user: @user, step_id: @paid_step.id)

    pay!
    assert Policy.allowed_step?(user: @user, step_id: @paid_step.id)
  end

  test "the cache key changes when entitlement changes" do
    before = Policy.cache_key(user: @user, step: @paid_step)
    pay!
    assert_not_equal before, Policy.cache_key(user: @user, step: @paid_step.reload)
  end

  # Spec: route-commerce-owner-dashboard-design.md line 246 ("Automated
  # post-refund access revocation is outside the first implementation unless a
  # separate policy is approved") and line 316 (listed under Explicitly
  # Deferred). Do NOT "fix" this test to expect access to be revoked — that
  # would contradict the approved spec. If revocation is ever wanted, it needs
  # its own explicitly-approved policy change, not a silent tightening here.
  test "a refunded purchase keeps access because revocation is deliberately deferred" do
    purchase = pay!
    assert Policy.allowed_step?(user: @user, step_id: @paid_step.id)

    purchase.mark_refunded!(refunded_amount_cents: 299, refunded_at: Time.current)

    assert Policy.allowed_step?(user: @user, step_id: @paid_step.id)
  end

  # The other half of that ruling, which had no enforcement at all:
  # `RoutePurchase.generation_authorized?` was written so a refunded route
  # would stop costing us money, and then never called from anywhere. Reading
  # survives the refund; commissioning new AI work must not.
  test "a refunded purchase keeps reading but stops authorizing new generation" do
    purchase = pay!
    assert Policy.generation_allowed?(user: @user, step_id: @paid_step.id)

    purchase.mark_refunded!(refunded_amount_cents: 299, refunded_at: Time.current)

    assert Policy.allowed_step?(user: @user, step_id: @paid_step.id),
      "a refund must not revoke access to content already generated"
    assert_not Policy.generation_allowed?(user: @user, step_id: @paid_step.id),
      "a refunded route must not be able to commission more paid AI work"
  end

  test "generation on the free preview is unaffected by purchase state" do
    assert Policy.generation_allowed?(user: @user, step_id: @free_step.id)

    pay!.mark_refunded!(refunded_amount_cents: 299, refunded_at: Time.current)

    assert Policy.generation_allowed?(user: @user, step_id: @free_step.id)
  end

  test "generation is refused before payment and never crosses to another user" do
    assert_not Policy.generation_allowed?(user: @user, step_id: @paid_step.id)

    pay!
    stranger = Core::User.create!(
      name: "Str", email: "gen-str-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    assert_not Policy.generation_allowed?(user: stranger, step_id: @paid_step.id)
    assert_not Policy.generation_allowed?(user: nil, step_id: @paid_step.id)
  end

  test "the cache key's entitlement component still reflects the broadened (paid-or-refunded) definition" do
    purchase = pay!
    entitled_key = Policy.cache_key(user: @user, step: @paid_step.reload)
    assert_includes entitled_key, "entitled"

    purchase.mark_refunded!(refunded_amount_cents: 299, refunded_at: Time.current)
    still_entitled_key = Policy.cache_key(user: @user, step: @paid_step.reload)
    assert_includes still_entitled_key, "entitled"
    assert_not_includes still_entitled_key, "unentitled"
  end

  private

  def create_purchase(state:)
    quote = Commerce::RouteQuote.create_snapshot!(
      user: @user, learning_route: @route, currency: "USD",
      total_module_count: 2, paid_module_count: 1,
      estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40,
      markup_basis_points: Commerce::PricingConstants::MARKUP_BASIS_POINTS,
      minimum_price_per_paid_module_cents: Commerce::PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS,
      cost_based_price_cents: 210, minimum_price_cents: 299, final_price_cents: 299,
      estimator_version: "v1", provider_rate_versions: { "m" => "1" }, fee_version: "f1",
      image_quality: "medium", route_shape_assumptions: { "outline" => [] },
      provider_rate_assumptions: { "m" => {} }, fee_assumptions: { "version" => "f1" },
      expires_at: 24.hours.from_now
    )
    Commerce::RoutePurchase.create!(
      user: @user, learning_route: @route, route_quote: quote, state: state,
      provider: "lemon_squeezy", test_mode: true, amount_cents: 299, currency: "USD",
      estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40
    )
  end

  def pay!
    purchase = create_purchase(state: "pending")
    purchase.mark_paid!(order_id: "ord_#{SecureRandom.hex(3)}", actual_fee_cents: 45, paid_at: Time.current)
    purchase
  end
end
