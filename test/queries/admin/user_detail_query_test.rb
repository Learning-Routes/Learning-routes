require "test_helper"

class AdminUserDetailQueryTest < ActiveSupport::TestCase
  test "returns only the requested user's routes progress states and attributed cost" do
    user = create_test_user(name: "Detail Student")
    other = create_test_user
    profile = LearningRoutesEngine::LearningProfile.create!(user: user)
    route = profile.learning_routes.create!(topic: "Private Route", status: :paused, generation_status: "failed")
    route.route_steps.create!(title: "Done", position: 0, status: :completed)
    route.route_steps.create!(title: "Locked", position: 1, status: :locked)
    AiOrchestrator::AiInteraction.create!(user: user, model: "gpt-5.2", prompt: "secret", status: :completed,
      pricing_status: "priced", cost_microcents: 8_765, metadata: { route_id: route.id })
    LearningRoutesEngine::LearningProfile.create!(user: other).learning_routes.create!(topic: "Other Route")

    detail = Admin::UserDetailQuery.call(user_id: user.id)

    assert_equal user.id, detail.user.id
    assert_equal [route.id], detail.routes.map(&:id)
    row = detail.routes.sole
    assert_equal "paused", row.state
    assert_equal "failed", row.generation_state
    assert_equal 1, row.completed_steps
    assert_equal 2, row.total_steps
    assert_equal 8_765, row.cost_microcents
    assert_equal false, row.purchase_ready
  end
end
