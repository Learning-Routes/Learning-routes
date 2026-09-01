require "test_helper"

class AdminDashboardSummaryQueryTest < ActiveSupport::TestCase
  test "summarizes only registered users routes and exact billable WP-7 cost" do
    user = create_test_user
    profile = LearningRoutesEngine::LearningProfile.create!(user: user)
    profile.learning_routes.create!(topic: "One", status: :active)
    AiOrchestrator::AiInteraction.create!(user: user, model: "gpt-5.2", prompt: "private", status: :completed,
      pricing_status: "priced", cached: false, cost_microcents: 43_210)
    AiOrchestrator::AiInteraction.create!(user: user, model: "gpt-5.2", prompt: "cached", status: :completed,
      pricing_status: "priced", cached: true, cost_microcents: 99_999)

    summary = Admin::DashboardSummaryQuery.call

    assert_equal Core::User.count, summary.registered_users
    assert_equal LearningRoutesEngine::LearningRoute.count, summary.routes
    assert_equal 43_210, summary.cost_microcents
    assert_equal false, summary.commerce_available
  end
end
