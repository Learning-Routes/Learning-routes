require "test_helper"

module LearningRoutesEngine
  class RouteModuleConcurrencyTest < ActiveSupport::TestCase
    self.use_transactional_tests = false

    setup do
      delete_concurrency_records
      user = create_test_user(email: "route-module-concurrency-#{SecureRandom.hex(4)}@example.test")
      profile = LearningProfile.create!(user: user, current_level: "beginner")
      @route = LearningRoute.create!(learning_profile: profile, topic: "Concurrency")
    end

    teardown do
      delete_concurrency_records
    end

    test "simultaneous bypass attempts cannot add another preview" do
      ready = Queue.new
      release = Queue.new
      results = Queue.new

      threads = 2.times.map do |index|
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            ready << true
            release.pop
            begin
              RouteModule.insert!(attributes_for(position: index + 2))
              results << :inserted
            rescue ActiveRecord::StatementInvalid => error
              results << error
            end
          end
        end
      end

      2.times { ready.pop }
      2.times { release << true }
      threads.each(&:join)
      outcomes = 2.times.map { results.pop }

      assert_equal 1, RouteModule.where(learning_route_id: @route.id, access_state: :preview).count
      assert_equal 2, outcomes.count { |result| result.is_a?(ActiveRecord::StatementInvalid) }
      assert_not outcomes.include?(:inserted)
    ensure
      2.times { release << true } if release
      threads&.each(&:join)
    end

    private

    def delete_concurrency_records
      users = Core::User.where("email LIKE ?", "route-module-concurrency-%")
      profiles = LearningProfile.where(user_id: users.select(:id))
      LearningRoute.where(learning_profile_id: profiles.select(:id)).delete_all
      profiles.delete_all
      users.delete_all
    end

    def attributes_for(position:)
      {
        learning_route_id: @route.id,
        position: position,
        title: "Competing preview",
        access_state: 0,
        generation_state: 0,
        translations: {},
        metadata: {},
        created_at: Time.current,
        updated_at: Time.current
      }
    end
  end
end
