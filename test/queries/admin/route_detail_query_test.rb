require "test_helper"

class AdminRouteDetailQueryTest < ActiveSupport::TestCase
  test "returns ordered module states with pagination capped at one hundred" do
    user = create_test_user
    profile = LearningRoutesEngine::LearningProfile.create!(user: user)
    route = profile.learning_routes.create!(topic: "Many modules")
    100.times do |index|
      route.route_modules.create!(position: index + 2, title: "Module #{index + 2}",
        access_state: :locked, generation_state: index.even? ? :outlined : :failed)
    end

    first = Admin::RouteDetailQuery.call(route_id: route.id, page: 1, per_page: 500)
    second = Admin::RouteDetailQuery.call(route_id: route.id, page: 2, per_page: 100)

    assert_equal 100, first.modules.size
    assert_equal 101, first.total_count
    assert_equal (1..100).to_a, first.modules.map(&:position)
    assert first.modules.first.preview
    assert_equal [101], second.modules.map(&:position)
  end

  test "query count is fixed as module volume grows" do
    user = create_test_user
    route = LearningRoutesEngine::LearningProfile.create!(user: user).learning_routes.create!(topic: "Volume")
    small = count_queries { Admin::RouteDetailQuery.call(route_id: route.id) }
    30.times { |i| route.route_modules.create!(position: i + 2, title: "M#{i}", access_state: :locked) }
    large = count_queries { Admin::RouteDetailQuery.call(route_id: route.id) }

    assert_equal small, large
    assert_operator large, :<=, 4
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
