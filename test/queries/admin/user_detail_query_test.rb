require "test_helper"

class AdminUserDetailQueryTest < ActiveSupport::TestCase
  test "returns only the requested user's routes progress states and attributed cost" do
    user = create_test_user(name: "Detail Student", email_verified_at: Time.current, onboarding_completed: true)
    other = create_test_user
    profile = LearningRoutesEngine::LearningProfile.create!(user: user)
    route = profile.learning_routes.create!(topic: "Private Route", status: :paused, generation_status: "failed")
    route.route_steps.create!(title: "Done", position: 0, status: :completed)
    route.route_steps.create!(title: "Locked", position: 1, status: :locked)
    AiOrchestrator::AiInteraction.create!(user: user, model: "gpt-5.2", prompt: "secret", status: :completed,
      pricing_status: "priced", cost_microcents: 8_765, metadata: { route_id: route.id })
    outline = AiOrchestrator::AiInteraction.create!(user: user, model: "gpt-5.2", prompt: "outline",
      status: :completed, pricing_status: "priced", cost_microcents: 12_345)
    route.update!(ai_interaction_id: outline.id)
    AiOrchestrator::AiInteraction.create!(user: user, model: "tavily", prompt: "provider usage",
      status: :completed, pricing_status: "unpriced", metadata: { route_id: route.id })
    AiOrchestrator::AiInteraction.create!(user: user, model: "gpt-5.2", prompt: "invalid attribution",
      status: :completed, pricing_status: "priced", cost_microcents: 99_999, metadata: { route_id: "invalid" })
    LearningRoutesEngine::LearningProfile.create!(user: other).learning_routes.create!(topic: "Other Route")

    detail = Admin::UserDetailQuery.call(user_id: user.id)

    assert_equal user.id, detail.user.id
    assert_equal "student", detail.user.role
    assert detail.user.email_verified
    assert detail.user.onboarding_completed
    assert_equal [route.id], detail.routes.map(&:id)
    row = detail.routes.sole
    assert_equal "paused", row.state
    assert_equal "failed", row.generation_state
    assert_equal 1, row.completed_steps
    assert_equal 2, row.total_steps
    assert_equal 21_110, row.cost_microcents
    assert_equal 1, row.unpriced_interactions
    assert_equal 121_109, detail.user.cost_microcents
    assert_equal 1, detail.user.unpriced_interactions
    assert_equal false, row.purchase_ready
  end

  test "paginates a user's routes with a fixed upper bound" do
    user = create_test_user
    profile = LearningRoutesEngine::LearningProfile.create!(user: user)
    26.times { |index| profile.learning_routes.create!(topic: "Route #{index}") }

    first_page = Admin::UserDetailQuery.call(user_id: user.id)
    second_page = Admin::UserDetailQuery.call(user_id: user.id, page: 2)

    assert_equal 25, first_page.routes.size
    assert_equal 26, first_page.total_count
    assert_equal 1, first_page.page
    assert_equal 1, second_page.routes.size
    assert_equal 2, second_page.page
  end

  test "query count remains fixed as route volume grows" do
    user = create_test_user
    profile = LearningRoutesEngine::LearningProfile.create!(user: user)

    small = count_queries { Admin::UserDetailQuery.call(user_id: user.id) }
    30.times { |index| profile.learning_routes.create!(topic: "Volume Route #{index}") }
    large = count_queries { Admin::UserDetailQuery.call(user_id: user.id) }

    assert_equal 5, small
    assert_equal 5, large
  end

  test "route readiness requires completed generation and real content" do
    user = create_test_user
    profile = LearningRoutesEngine::LearningProfile.create!(user: user)
    empty = profile.learning_routes.create!(topic: "Completed Empty", generation_status: "completed")
    ready = profile.learning_routes.create!(topic: "Completed Content", generation_status: "completed")
    ready.route_steps.create!(title: "Real Step", position: 0)

    rows = Admin::UserDetailQuery.call(user_id: user.id).routes.index_by(&:id)

    assert_equal false, rows.fetch(empty.id).purchase_ready
    assert_equal true, rows.fetch(ready.id).purchase_ready
  end

  test "reports persisted module and active quote facts without deriving commerce claims" do
    user = create_test_user
    profile = LearningRoutesEngine::LearningProfile.create!(user: user)
    quoted = profile.learning_routes.create!(topic: "Quoted", generation_status: "completed")
    preview = quoted.route_modules.find_by!(access_state: :preview)
    preview.update!(title: "Real preview")
    quoted.route_modules.create!(position: 2, title: "Paid", access_state: :locked)
    quote = Commerce::RouteQuote.create!(quote_attributes(user, quoted))
    blocked = profile.learning_routes.create!(
      topic: "Blocked", generation_params: { "quote_blocked_reason" => "pricing_configuration_missing" }
    )

    rows = Admin::UserDetailQuery.call(user_id: user.id).routes.index_by(&:id)
    quoted_row = rows.fetch(quoted.id)
    blocked_row = rows.fetch(blocked.id)

    assert_equal 2, quoted_row.module_count
    assert_equal 1, quoted_row.paid_module_count
    assert_equal preview.id, quoted_row.preview_module_id
    assert_equal "Real preview", quoted_row.preview_module_title
    assert_equal "available", quoted_row.quote_status
    assert_equal quote.id, quoted_row.quote_id
    assert_equal 1_234_567, quoted_row.estimated_ai_cost_microcents
    assert_equal "pricing_configuration_missing", blocked_row.quote_blocked_reason
    assert_nil blocked_row.estimated_ai_cost_microcents
  end

  private

  def count_queries
    count = 0
    callback = ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
      count += 1 unless payload[:name].to_s.match?(/SCHEMA|TRANSACTION/)
    end
    yield
    count
  ensure
    ActiveSupport::Notifications.unsubscribe(callback)
  end


  def quote_attributes(user, route)
    {
      user: user, learning_route: route, currency: "USD", total_module_count: 2,
      paid_module_count: 1, estimated_ai_cost_microcents: 1_234_567,
      estimated_fee_cents: 20, markup_basis_points: 5000,
      minimum_price_per_paid_module_cents: 299, cost_based_price_cents: 350,
      minimum_price_cents: 299, final_price_cents: 350, estimator_version: "route-cost-v1",
      provider_rate_versions: { "openai" => "v1" }, fee_version: "fee-v1",
      image_quality: "medium", route_shape_assumptions: { "modules" => 2 },
      provider_rate_assumptions: { "openai" => { "version" => "v1" } },
      fee_assumptions: { "percentage_basis_points" => 500, "fixed_cents" => 10 },
      expires_at: 1.day.from_now
    }
  end
end
