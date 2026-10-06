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

  # ─── parent_id ─────────────────────────────────────────────────────

  test "a stored triggering_step_id names the parent" do
    first = step!(@preview, 0, "First")
    second = step!(@preview, 1, "Second")
    child = step!(@preview, 2, "Reinforcement",
                  metadata: { "reinforcement" => true, "triggering_step_id" => first.id })

    topics = preview_topics
    assert_nil topics[first.id]["parent_id"]
    assert_nil topics[second.id]["parent_id"]
    assert_equal first.id, topics[child.id]["parent_id"],
      "the stored trigger wins over the nearest preceding step (#{second.id})"
  end

  test "a legacy reinforcement without a stored id resolves by position" do
    step!(@preview, 0, "First")
    second = step!(@preview, 1, "Second")
    children = (2..4).map do |pos|
      step!(@preview, pos, "Legacy #{pos}", metadata: { "reinforcement" => true, "trigger_score" => 40 })
    end

    topics = preview_topics
    children.each { |c| assert_equal second.id, topics[c.id]["parent_id"] }
  end

  test "a stored id that is not a primary step in this module falls back to position" do
    primary = step!(@preview, 0, "Primary")
    other_module_step = step!(@paid, 10, "Elsewhere")
    child = step!(@preview, 1, "Reinforcement",
                  metadata: { "reinforcement" => true, "triggering_step_id" => other_module_step.id })

    assert_equal primary.id, preview_topics[child.id]["parent_id"]
  end

  test "a purchased module carries parent ids" do
    step!(@preview, 0, "Free lesson")
    primary = step!(@paid, 10, "Paid lesson")
    child = step!(@paid, 11, "Paid reinforcement",
                  metadata: { "reinforcement" => true, "triggering_step_id" => primary.id })
    pay_for_route!(@route)

    topics = journey_stages.find { |s| s["module_id"] == @paid.id }["topics"].index_by { |t| t["id"] }
    assert_equal primary.id, topics[child.id]["parent_id"]
  end

  test "a reinforcement with no preceding primary step is an orphan" do
    orphan = step!(@preview, 0, "Orphan", metadata: { "reinforcement" => true })
    step!(@preview, 1, "Primary")

    topics = preview_topics
    assert_equal true, topics[orphan.id]["reinforcement"]
    assert topics[orphan.id].key?("parent_id"), "parent_id must be emitted, nil for an orphan"
    assert_nil topics[orphan.id]["parent_id"]
  end

  test "only boolean true makes a step reinforcement" do
    legacy = step!(@preview, 0, "Old flag", metadata: { "triggering_module_id" => @preview.id })
    stringy = step!(@preview, 1, "String flag", metadata: { "reinforcement" => "true" })

    topics = preview_topics
    assert_equal false, topics[legacy.id]["reinforcement"], "triggering_module_id has no writer"
    assert_equal false, topics[stringy.id]["reinforcement"]
  end

  # ─── current ───────────────────────────────────────────────────────

  test "exactly one topic is current: the step at route.current_step" do
    step!(@preview, 0, "Done", status: :completed)
    at_current = step!(@preview, 1, "Here")
    step!(@preview, 2, "Next", status: :locked)

    current = all_topics.select { |t| t["current"] }
    assert_equal [at_current.id], current.map { |t| t["id"] }
  end

  test "when current_step is not a readable step, the first available one is current" do
    @route.update!(current_step: 10)
    step!(@preview, 0, "Done", status: :completed)
    available = step!(@preview, 1, "Open")
    step!(@paid, 10, "Behind the paywall")

    current = all_topics.select { |t| t["current"] }
    assert_equal [available.id], current.map { |t| t["id"] }
  end

  test "a route with nothing readable marks no step current" do
    @route.update!(current_step: 10)
    step!(@paid, 10, "Behind the paywall")

    topics = all_topics
    assert topics.all? { |t| t.key?("current") }, "every topic says whether it is current"
    assert_equal [], topics.select { |t| t["current"] }
  end

  # ─── root ──────────────────────────────────────────────────────────

  test "the route root is its own value" do
    step!(@preview, 0, "First")
    get learning_routes_engine.journey_route_path(@route)

    node = css_select("[data-controller='route-journey']").first
    assert_equal({ "title" => "Map" }, JSON.parse(node["data-route-journey-root-value"]))
  end

  private

  def all_topics = journey_stages.flat_map { |s| s["topics"] }

  def preview_topics
    journey_stages.find { |s| s["module_id"] == @preview.id }["topics"].index_by { |t| t["id"] }
  end

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
