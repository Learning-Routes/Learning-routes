require "test_helper"

class AdminUserIndexQueryTest < ActiveSupport::TestCase
  setup do
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
    @user = Core::User.create!(name: "Needle Student", email: "needle@example.test", password: "password123", role: :student)
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user)
    @route = profile.learning_routes.create!(topic: "Bounded SQL", status: :active, generation_status: "completed")
    @route.route_steps.create!(title: "Done", position: 0, status: :completed)
    @user.sessions.create!(last_active_at: 2.hours.ago)
    AiOrchestrator::AiInteraction.create!(user: @user, model: "gpt-5.2", prompt: "secret", status: :completed,
      pricing_status: "priced", cost_microcents: 12_345, metadata: { route_id: @route.id })
  end

  test "returns bounded searched user metrics and exact billable cost" do
    result = Admin::UserIndexQuery.new(search: "needle", page: 1).call
    row = result.rows.sole

    assert_equal @user.id, row.id
    assert_equal 1, row.route_count
    assert_equal 1, row.completed_steps
    assert_equal 1, row.total_steps
    assert_equal 12_345, row.cost_microcents
    assert row.purchase_ready
    assert_equal 2.hours.ago.to_i, row.last_active_at.to_i
    assert_equal 25, result.per_page
  end

  test "query count does not grow with users" do
    small = count_queries { Admin::UserIndexQuery.new.call }
    30.times { |i| Core::User.create!(name: "Bulk #{i}", email: "bulk#{i}@example.test", password: "password123") }
    large = count_queries { Admin::UserIndexQuery.new.call }

    assert_operator large - small, :<=, 1
    assert_operator large, :<=, 3
  end

  test "filters by activity and route state while escaping wildcard search" do
    inactive = Core::User.create!(name: "Percent % User", email: "percent@example.test", password: "password123")

    active = Admin::UserIndexQuery.new(search: "%", activity: "active", route_state: "active").call
    inactive_result = Admin::UserIndexQuery.new(search: "%", activity: "inactive").call

    assert_empty active.rows
    assert_equal [inactive.id], inactive_result.rows.map(&:id)
  end

  test "pagination is bounded and deterministic" do
    result = Admin::UserIndexQuery.new(page: -4, per_page: 500).call

    assert_equal 1, result.page
    assert_equal 100, result.per_page
    assert_equal result.rows.sort_by { |row| [row.registered_at, row.id] }.reverse.map(&:id), result.rows.map(&:id)
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
