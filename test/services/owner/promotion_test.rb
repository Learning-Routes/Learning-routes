require "test_helper"

class OwnerPromotionTest < ActiveSupport::TestCase
  def setup
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
    OwnerAuditEvent.delete_all if defined?(OwnerAuditEvent)
    @user = create_user("candidate@example.test")
  end

  test "promotes an existing account only after authenticating its password" do
    promoted = Owner::Promotion.call(email: @user.email, password: "password123")

    assert_predicate promoted.reload, :owner?
    assert_equal 1, OwnerAuditEvent.where(action: "owner.promoted", subject_user_id: @user.id).count
  end

  test "rejects missing, unknown, and incorrect credentials without revealing which failed" do
    [
      [nil, nil],
      ["missing@example.test", "password123"],
      [@user.email, "incorrect-password"]
    ].each do |email, password|
      error = assert_raises(Owner::Promotion::AuthenticationError) do
        Owner::Promotion.call(email: email, password: password)
      end
      assert_equal "Owner promotion credentials are invalid", error.message
    end

    assert_not_predicate @user.reload, :owner?
  end

  test "does not replace a different owner" do
    existing = create_user("existing-owner@example.test", role: :owner)

    assert_raises(Owner::Promotion::OwnerExistsError) do
      Owner::Promotion.call(email: @user.email, password: "password123")
    end

    assert_predicate existing.reload, :owner?
    assert_not_predicate @user.reload, :owner?
  end

  test "promotion is idempotent for the same owner and invalidates existing sessions" do
    session = @user.sessions.create!(last_active_at: Time.current)

    2.times { Owner::Promotion.call(email: @user.email, password: "password123") }

    assert_not Core::Session.exists?(session.id)
    assert_equal 1, OwnerAuditEvent.where(action: "owner.promoted", subject_user_id: @user.id).count
  end

  test "audit evidence contains no email password digest or credential" do
    Owner::Promotion.call(email: @user.email, password: "password123")
    serialized = OwnerAuditEvent.last.attributes.to_json

    assert_no_match(/candidate@example/, serialized)
    assert_no_match(/password123/, serialized)
    assert_no_match(/#{Regexp.escape(@user.password_digest)}/, serialized)
  end

  private

  def create_user(email, role: :student)
    Core::User.create!(
      name: "Promotion Candidate", email: email, password: "password123",
      password_confirmation: "password123", role: role, email_verified_at: Time.current
    )
  end
end
