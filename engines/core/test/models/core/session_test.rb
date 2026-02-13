require "test_helper"

module Core
  class SessionTest < ActiveSupport::TestCase
    test "requires user" do
      session = Core::Session.new(user: nil)
      assert_not session.valid?
    end

    test "expired? returns true for old sessions" do
      session = Core::Session.new(last_active_at: 31.days.ago)
      assert session.expired?
    end

    test "expired? returns false for recent sessions" do
      session = Core::Session.new(last_active_at: 1.hour.ago)
      assert_not session.expired?
    end
  end
end
