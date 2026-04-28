require "test_helper"

module Core
  class RememberMeTest < ActiveSupport::TestCase
    def setup
      @user = Core::User.create!(
        name: "Remember Test",
        email: "remember-#{SecureRandom.hex(4)}@example.com",
        password: "password123",
        password_confirmation: "password123"
      )
    end

    test "remember! stores a SHA-256 digest, never the raw token" do
      raw = @user.remember!
      stored = @user.reload.remember_token

      assert_not_equal raw, stored, "DB column must hold a digest, not the raw token"
      assert_equal 64, stored.length, "SHA-256 hex is 64 chars"
      assert_match(/\A[0-9a-f]{64}\z/, stored)
    end

    test "find_by_remember_credential matches the issuing user" do
      raw = @user.remember!
      found = Core::User.find_by_remember_credential(user_id: @user.id, raw_token: raw)
      assert_equal @user.id, found&.id
    end

    test "find_by_remember_credential rejects a wrong token" do
      @user.remember!
      assert_nil Core::User.find_by_remember_credential(user_id: @user.id, raw_token: "garbage")
    end

    test "find_by_remember_credential rejects a token after forget!" do
      raw = @user.remember!
      @user.forget!
      assert_nil Core::User.find_by_remember_credential(user_id: @user.id, raw_token: raw)
    end

    test "find_by_remember_credential rejects a token bound to a different user_id" do
      other = Core::User.create!(
        name: "Other", email: "other-#{SecureRandom.hex(4)}@example.com",
        password: "password123", password_confirmation: "password123"
      )
      raw = @user.remember!
      assert_nil Core::User.find_by_remember_credential(user_id: other.id, raw_token: raw)
    end

    test "find_by_remember_credential returns nil for blank inputs" do
      assert_nil Core::User.find_by_remember_credential(user_id: nil, raw_token: "x")
      assert_nil Core::User.find_by_remember_credential(user_id: @user.id, raw_token: "")
    end

    test "remember! returns a different raw token each call (rotation)" do
      first = @user.remember!
      second = @user.remember!
      assert_not_equal first, second

      # Old token must no longer match — important for "log out other devices"
      assert_nil Core::User.find_by_remember_credential(user_id: @user.id, raw_token: first)
      assert_equal @user.id, Core::User.find_by_remember_credential(user_id: @user.id, raw_token: second)&.id
    end
  end
end
