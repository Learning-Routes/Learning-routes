require "test_helper"

module LearningRoutesEngine
  class LegacyModuleBackfillConcurrencyTest < ActiveSupport::TestCase
    self.use_transactional_tests = false

    setup do
      connection.execute <<~SQL
        ALTER TABLE learning_routes_engine_route_steps
        ALTER COLUMN route_module_id DROP NOT NULL
      SQL
      delete_records
      user = create_test_user(email: "legacy-backfill-concurrency-#{SecureRandom.hex(4)}@example.test")
      profile = LearningProfile.create!(user: user, current_level: "beginner")
      @route = LearningRoute.create!(learning_profile: profile, topic: "Concurrent migration")
      @steps = [
        RouteStep.create!(learning_route: @route, position: 0, level: :nv1, title: "First"),
        RouteStep.create!(learning_route: @route, position: 1, level: :nv2, title: "Second")
      ]
      RouteStep.where(id: @steps.map(&:id)).update_all(route_module_id: nil)
    end

    teardown do
      LegacyModuleBackfill.call(@route) if @route&.persisted?
      delete_records
      connection.execute <<~SQL
        ALTER TABLE learning_routes_engine_route_steps
        ALTER COLUMN route_module_id SET NOT NULL
      SQL
    end

    test "concurrent backfills serialize on the route row and remain idempotent" do
      locked = Queue.new
      release = Queue.new

      first = Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          LearningRoute.transaction do
            LearningRoute.lock.find(@route.id)
            locked << true
            release.pop
            LegacyModuleBackfill.call(@route)
          end
        end
      end
      locked.pop

      second_pid = Queue.new
      second = Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do |thread_connection|
          second_pid << thread_connection.select_value("SELECT pg_backend_pid()")
          LegacyModuleBackfill.call(LearningRoute.find(@route.id))
        end
      end

      assert_backend_blocked(second_pid.pop)
      release << true
      first.value
      second.value

      modules = RouteModule.where(learning_route_id: @route.id).order(:position)
      assert_equal 2, modules.count
      assert_equal 1, modules.where(access_state: :preview).count
      assert_equal modules.pluck(:id), RouteStep.where(id: @steps.map(&:id)).order(:position).pluck(:route_module_id)
    ensure
      release << true if release
      first&.join
      second&.join
    end

    private

    def connection
      ActiveRecord::Base.connection
    end

    def assert_backend_blocked(pid)
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 5
      observer = ActiveRecord::Base.connection_pool.checkout
      begin
        loop do
          observer.clear_query_cache
          blocker_count = observer.select_value(
            "SELECT cardinality(pg_blocking_pids(#{Integer(pid)}))"
          ).to_i
          return assert_operator(blocker_count, :>, 0) if blocker_count.positive?
          flunk("PostgreSQL backend #{pid} did not block on the route row") if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline

          sleep 0.01
        end
      ensure
        ActiveRecord::Base.connection_pool.checkin(observer)
      end
    end

    def delete_records
      users = Core::User.where("email LIKE ?", "legacy-backfill-concurrency-%")
      profiles = LearningProfile.where(user_id: users.select(:id))
      routes = LearningRoute.where(learning_profile_id: profiles.select(:id))
      RouteStep.where(learning_route_id: routes.select(:id)).delete_all
      routes.delete_all
      profiles.delete_all
      users.delete_all
    end
  end
end
