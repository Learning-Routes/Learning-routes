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
end
