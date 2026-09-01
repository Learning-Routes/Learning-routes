require "test_helper"

class OwnerPromotionConcurrencyTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  setup do
    OwnerAuditEvent.delete_all
    Core::Session.delete_all
    Core::User.where("email LIKE ?", "concurrent-owner-%").delete_all
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
  end

  teardown do
    OwnerAuditEvent.delete_all
    Core::Session.delete_all
    Core::User.where("email LIKE ?", "concurrent-owner-%").delete_all
  end

  test "simultaneous promotions serialize and persist exactly one owner" do
    users = 2.times.map do |index|
      Core::User.create!(name: "Concurrent Owner", email: "concurrent-owner-#{index}@example.test",
        password: "password123", password_confirmation: "password123")
    end
    ready = Queue.new
    release = Queue.new
    results = Queue.new
    threads = users.map do |user|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          release.pop
          begin
            results << Owner::Promotion.call(email: user.email, password: "password123")
          rescue Owner::Promotion::OwnerExistsError => error
            results << error
          end
        end
      end
    end
    2.times { ready.pop }
    2.times { release << true }
    threads.each(&:join)
    outcomes = 2.times.map { results.pop }

    assert_equal 1, Core::User.owner.count
    assert_equal 1, outcomes.count { |result| result.is_a?(Core::User) }
    assert_equal 1, outcomes.count { |result| result.is_a?(Owner::Promotion::OwnerExistsError) }
    assert_equal 1, OwnerAuditEvent.where(action: "owner.promoted").count
  end
end
