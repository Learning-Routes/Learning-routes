require "test_helper"

# WP-37 §1. The journey's JSON is what the map draws, so its shape is asserted
# here, against the server, before any pixel exists.
class LearningRoutesEngine::JourneyMapDataTest < ActionDispatch::IntegrationTest
  def setup
    # The UI locale is current_user.locale (core/application_controller.rb:54-60);
    # the fixture user is Spanish, so the assertions below are Spanish.
    @user = create_test_user(email_verified_at: Time.current, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Map", locale: "es", status: :active, current_step: 1
    )
    @preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
    @paid = @route.route_modules.create!(
      position: 2, title: "Paid module", access_state: :locked, generation_state: :ready
    )
    sign_in_as(@user)
  end

  # ─── Readability: preview, purchased, locked ───────────────────────

  test "the preview module is readable" do
    step!(@preview, 0, "Free lesson")

    stage = journey_stages.find { |s| s["module_id"] == @preview.id }
    assert_equal true, stage["readable"]
    assert_equal "Free lesson", stage["topics"].first["name"]
  end

  test "a locked module hides titles, links and structure" do
    step!(@preview, 0, "Free lesson")
    primary = step!(@paid, 10, "Paid lesson")
    step!(@paid, 11, "Paid reinforcement", metadata: { "reinforcement" => true, "triggering_step_id" => primary.id })

    stage = journey_stages.find { |s| s["module_id"] == @paid.id }
    assert_equal false, stage["readable"]
    stage["topics"].each do |topic|
      assert_nil topic["path"]
      assert_nil topic["parent_id"], "a locked module must not reveal which step a triplet hangs from"
      assert_equal false, topic["reinforcement"]
    end
    assert_not_includes response.body, "Paid lesson"
  end

  test "a purchased module is readable, with its titles and links" do
    step!(@preview, 0, "Free lesson")
    primary = step!(@paid, 10, "Paid lesson")
    pay_for_route!(@route)

    stage = journey_stages.find { |s| s["module_id"] == @paid.id }
    assert_equal true, stage["readable"], "the student who paid sees the module they bought"
    topic = stage["topics"].find { |t| t["id"] == primary.id }
    assert_equal "Paid lesson", topic["name"]
    assert topic["path"].present?
  end

  test "the journey header counts the purchased module's steps" do
    step!(@preview, 0, "Free lesson")
    step!(@paid, 10, "Paid lesson")
    pay_for_route!(@route)

    get learning_routes_engine.journey_route_path(@route)

    assert_match(/· 2 temas ·/, response.body, "@steps must come from the policy, not from access_preview?")
  end

  test "the list view lists a purchased module's steps without the lock" do
    step!(@preview, 0, "Free lesson")
    step!(@paid, 10, "Paid lesson")
    pay_for_route!(@route)

    get learning_routes_engine.route_path(@route)

    assert_response :success
    assert_includes response.body, "Paid lesson"
    assert_select "section[data-module-access='locked'] span[aria-label]", count: 0
    assert_select "section[data-module-access='locked']", text: /Comprado/
  end

  private

  def step!(route_module, position, title, status: :available, metadata: {})
    @route.route_steps.create!(
      route_module: route_module, position: position, title: title, status: status,
      content_type: :lesson, level: :nv1, bloom_level: 1, metadata: metadata
    )
  end

  def journey_stages
    get learning_routes_engine.journey_route_path(@route)
    assert_response :success
    node = css_select("[data-controller='route-journey']").first
    JSON.parse(node["data-route-journey-stages-value"])
  end

  # The same purchase the paywall tests build (module_lock_authorization_test.rb:182).
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
