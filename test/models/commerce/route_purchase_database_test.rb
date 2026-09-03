require "test_helper"

class Commerce::RoutePurchaseDatabaseTest < ActiveSupport::TestCase
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

  test "raw SQL cannot insert a purchase for a route the user does not own" do
    stranger = Core::User.create!(
      name: "Stranger", email: "sx-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL, stranger.id, @route.id, @quote.id])
      INSERT INTO commerce_route_purchases
        (id, user_id, learning_route_id, route_quote_id, state, provider, test_mode,
         amount_cents, currency, estimated_ai_cost_microcents, estimated_fee_cents,
         created_at, updated_at)
      VALUES (gen_random_uuid(), ?, ?, ?, 'pending', 'lemon_squeezy', true,
              299, 'USD', 0, 0, NOW(), NOW())
    SQL

    error = assert_raises(ActiveRecord::StatementInvalid) do
      ActiveRecord::Base.connection.execute(sql)
    end
    assert_match(/must own the learning route/, error.message)
  end

  test "raw SQL cannot insert a purchase whose amount disagrees with its quote" do
    sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL, @user.id, @route.id, @quote.id])
      INSERT INTO commerce_route_purchases
        (id, user_id, learning_route_id, route_quote_id, state, provider, test_mode,
         amount_cents, currency, estimated_ai_cost_microcents, estimated_fee_cents,
         created_at, updated_at)
      VALUES (gen_random_uuid(), ?, ?, ?, 'pending', 'lemon_squeezy', true,
              1, 'USD', 0, 0, NOW(), NOW())
    SQL

    error = assert_raises(ActiveRecord::StatementInvalid) do
      ActiveRecord::Base.connection.execute(sql)
    end
    assert_match(/must match its quote/, error.message)
  end

  test "raw SQL cannot create a second paid purchase for one route" do
    purchase = Commerce::RoutePurchase.create!(
      user: @user, learning_route: @route, route_quote: @quote, state: "pending",
      provider: "lemon_squeezy", test_mode: true, amount_cents: @quote.final_price_cents,
      currency: "USD", estimated_ai_cost_microcents: 0, estimated_fee_cents: 0
    )
    purchase.mark_paid!(order_id: "ord_1", actual_fee_cents: 1, paid_at: Time.current)

    sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL, @user.id, @route.id, @quote.id])
      INSERT INTO commerce_route_purchases
        (id, user_id, learning_route_id, route_quote_id, state, provider, test_mode,
         provider_order_id, paid_at, amount_cents, currency,
         estimated_ai_cost_microcents, estimated_fee_cents, created_at, updated_at)
      VALUES (gen_random_uuid(), ?, ?, ?, 'paid', 'lemon_squeezy', true,
              'ord_forced', NOW(), 299, 'USD', 0, 0, NOW(), NOW())
    SQL

    assert_raises(ActiveRecord::RecordNotUnique) { ActiveRecord::Base.connection.execute(sql) }
  end

  test "a paid row without an order id is rejected by the database" do
    sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL, @user.id, @route.id, @quote.id])
      INSERT INTO commerce_route_purchases
        (id, user_id, learning_route_id, route_quote_id, state, provider, test_mode,
         amount_cents, currency, estimated_ai_cost_microcents, estimated_fee_cents,
         created_at, updated_at)
      VALUES (gen_random_uuid(), ?, ?, ?, 'paid', 'lemon_squeezy', true,
              299, 'USD', 0, 0, NOW(), NOW())
    SQL

    error = assert_raises(ActiveRecord::StatementInvalid) { ActiveRecord::Base.connection.execute(sql) }
    assert_match(/route_purchases_paid_needs_order/, error.message)
  end
end
