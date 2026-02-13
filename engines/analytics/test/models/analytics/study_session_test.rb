require "test_helper"

module Analytics
  class StudySessionTest < ActiveSupport::TestCase
    test "requires started_at" do
      session = StudySession.new(started_at: nil)
      assert_not session.valid?
      assert_includes session.errors[:started_at], "can't be blank"
    end

    test "active? returns true when ended_at is nil" do
      session = StudySession.new(started_at: Time.current)
      assert session.active?
    end

    test "active? returns false when ended_at is set" do
      session = StudySession.new(started_at: 1.hour.ago, ended_at: Time.current)
      assert_not session.active?
    end
  end
end
