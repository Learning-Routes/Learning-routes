# frozen_string_literal: true

require "test_helper"

class ContentEngine::Tools::UserProgressTest < ActiveSupport::TestCase
  setup do
    @tool = ContentEngine::Tools::UserProgress.new
  end

  teardown do
    Thread.current[:lesson_agent_user] = nil
  end

  test "returns progress hash with expected keys when user exists" do
    user = Core::User.create!(
      email: "progress-test-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      name: "Test User"
    )
    UserEngagement.create!(
      user: user,
      current_streak: 7,
      longest_streak: 14,
      total_xp: 1250,
      current_level: 5,
      xp_to_next_level: 400,
      current_league: "silver",
      last_activity_date: Date.current
    )

    Thread.current[:lesson_agent_user] = user
    result = execute_tool(info_type: "overview")
    parsed = JSON.parse(result)

    assert_equal 7, parsed["current_streak"]
    assert_equal 5, parsed["current_level"]
    assert_equal 1250, parsed["total_xp"]
    assert_equal "silver", parsed["league"]
  end

  test "returns not-available message when no user in thread context" do
    Thread.current[:lesson_agent_user] = nil
    result = execute_tool(info_type: "overview")
    assert_includes result, "not available"
  end

  test "returns default values when user has no engagement record" do
    user = Core::User.create!(
      email: "no-engagement-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      name: "New User"
    )

    Thread.current[:lesson_agent_user] = user
    result = execute_tool(info_type: "overview")
    parsed = JSON.parse(result)

    assert_equal 0, parsed["streak"]
    assert_equal 1, parsed["level"]
    assert_equal 0, parsed["xp"]
    assert_equal "bronze", parsed["league"]
  end

  test "returns streak info when info_type is streak" do
    user = Core::User.create!(
      email: "streak-test-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      name: "Streak User"
    )
    UserEngagement.create!(
      user: user,
      current_streak: 10,
      longest_streak: 20,
      total_xp: 500,
      current_level: 3,
      xp_to_next_level: 200,
      current_league: "bronze",
      last_activity_date: Date.current
    )

    Thread.current[:lesson_agent_user] = user
    result = execute_tool(info_type: "streak")
    parsed = JSON.parse(result)

    assert_equal 10, parsed["current_streak"]
    assert_equal 20, parsed["longest_streak"]
    assert_equal true, parsed["active_today"]
    assert_equal Date.current.iso8601, parsed["last_activity"]
  end

  private

  def execute_tool(**kwargs)
    result = @tool.execute(**kwargs)
    result.is_a?(RubyLLM::Tool::Halt) ? result.content : result
  end
end
