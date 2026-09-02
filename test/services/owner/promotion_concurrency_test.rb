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

  test "recovery lock first makes promotion wait and delete the recovered session" do
    user = concurrent_user("recovery-first")
    raw_token = user.remember!
    recovery_locked = Queue.new
    release_recovery = Queue.new

    recovery = Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do
        Core::User.transaction do
          session = Core::User.recover_session_from_remember_credential(
            user_id: user.id, raw_token: raw_token, session_attributes: session_attributes
          )
          recovery_locked << session.id
          release_recovery.pop
        end
      end
    end
    recovered_session_id = recovery_locked.pop

    promotion_pid = Queue.new
    promotion = Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        promotion_pid << connection.select_value("SELECT pg_backend_pid()")
        Owner::Promotion.call(email: user.email, password: "password123")
      end
    end

    assert_backend_waiting_on_lock(promotion_pid.pop)
    release_recovery << true
    recovery.value
    promotion.value

    assert_not Core::Session.exists?(recovered_session_id)
    assert_revoked_owner_state(user, raw_token)
  ensure
    release_recovery << true if release_recovery
    recovery&.join
    promotion&.join
  end

  test "promotion lock first makes recovery wait and reject the cleared token" do
    user = concurrent_user("promotion-first")
    raw_token = user.remember!
    promotion_locked = Queue.new
    release_promotion = Queue.new

    promotion = Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do
        Core::User.transaction do
          Owner::Promotion.call(email: user.email, password: "password123")
          promotion_locked << true
          release_promotion.pop
        end
      end
    end
    promotion_locked.pop

    recovery_pid = Queue.new
    recovery = Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        recovery_pid << connection.select_value("SELECT pg_backend_pid()")
        Core::User.recover_session_from_remember_credential(
          user_id: user.id, raw_token: raw_token, session_attributes: session_attributes
        )
      end
    end

    assert_backend_waiting_on_lock(recovery_pid.pop)
    release_promotion << true
    promotion.value
    assert_nil recovery.value

    assert_revoked_owner_state(user, raw_token)
  ensure
    release_promotion << true if release_promotion
    promotion&.join
    recovery&.join
  end

  test "promotion authenticates the locked user snapshot after a concurrent password rotation" do
    user = concurrent_user("password-rotation")
    rotation_locked = Queue.new
    release_rotation = Queue.new
    promotion_pid = Queue.new
    result = Queue.new
    rotation = Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do
        Core::User.transaction do
          locked_user = Core::User.lock.find(user.id)
          locked_user.update!(password: "rotated-password", password_confirmation: "rotated-password")
          rotation_locked << true
          release_rotation.pop
        end
      end
    end
    rotation_locked.pop

    promotion = Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        promotion_pid << connection.select_value("SELECT pg_backend_pid()")
        result << Owner::Promotion.call(email: user.email, password: "password123")
      rescue StandardError => error
        result << error
      end
    end

    assert_backend_waiting_on_lock(promotion_pid.pop)
    release_rotation << true
    rotation.value
    promotion.value
    assert_instance_of Owner::Promotion::AuthenticationError, result.pop
    assert_predicate user.reload, :student?
    assert_equal 0, Core::User.owner.count
  ensure
    release_rotation << true if release_rotation
    rotation&.join
    promotion&.join
  end

  private

  def concurrent_user(suffix)
    Core::User.create!(name: "Concurrent Owner", email: "concurrent-owner-#{suffix}@example.test",
      password: "password123", password_confirmation: "password123")
  end

  def session_attributes
    { ip_address: "127.0.0.1", user_agent: "concurrency-test", last_active_at: Time.current }
  end

  def assert_backend_waiting_on_lock(pid)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 5
    loop do
      ActiveRecord::Base.connection.execute("SELECT pg_stat_clear_snapshot()")
      activity = ActiveRecord::Base.connection.select_one(<<~SQL)
        SELECT state, wait_event_type, wait_event, query
        FROM pg_stat_activity
        WHERE pid = #{Integer(pid)}
      SQL
      wait_type = activity&.fetch("wait_event_type", nil)
      return assert_equal("Lock", wait_type) if wait_type == "Lock"
      if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
        flunk("PostgreSQL backend #{pid} did not block on a database lock: #{activity.inspect}")
      end

      sleep 0.1
    end
  end

  def assert_revoked_owner_state(user, raw_token)
    assert_equal 1, Core::User.owner.count
    assert_nil Core::User.find_by_remember_credential(user_id: user.id, raw_token: raw_token)
    assert_empty Core::Session.where(user_id: user.id)
    assert_nil Core::User.recover_session_from_remember_credential(
      user_id: user.id, raw_token: raw_token, session_attributes: session_attributes
    )
    assert_empty Core::Session.where(user_id: user.id)
  end
end
