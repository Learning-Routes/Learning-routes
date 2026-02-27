require "test_helper"

class RouteRequestTest < ActiveSupport::TestCase
  def setup
    @user = Core::User.first || Core::User.create!(
      name: "Test User",
      email: "test-rr@example.com",
      password: "password123",
      password_confirmation: "password123"
    )
  end

  def valid_attrs
    {
      user: @user,
      topics: ["programming"],
      level: "beginner",
      pace: "steady",
      goals: ["career"]
    }
  end

  # --- Topic validation ---

  test "valid with a standard topic" do
    rr = RouteRequest.new(valid_attrs)
    assert rr.valid?, rr.errors.full_messages.join(", ")
  end

  test "valid with custom_topic and no standard topics" do
    rr = RouteRequest.new(valid_attrs.merge(topics: [], custom_topic: "Quantum Computing"))
    assert rr.valid?
  end

  test "invalid without any topic" do
    rr = RouteRequest.new(valid_attrs.merge(topics: [], custom_topic: nil))
    assert_not rr.valid?
  end

  test "invalid with unknown topic" do
    rr = RouteRequest.new(valid_attrs.merge(topics: ["nonexistent"]))
    assert_not rr.valid?
    assert rr.errors[:topics].any?
  end

  test "all 12 new topics are valid" do
    RouteRequest::VALID_TOPICS.each do |topic|
      rr = RouteRequest.new(valid_attrs.merge(topics: [topic]))
      assert rr.valid?, "Topic '#{topic}' should be valid but got: #{rr.errors.full_messages.join(', ')}"
    end
  end

  test "old arts topic is now invalid" do
    rr = RouteRequest.new(valid_attrs.merge(topics: ["arts"]))
    assert_not rr.valid?
    assert rr.errors[:topics].any?
  end

  # --- Level validation ---

  test "all four levels are valid" do
    %w[beginner basic intermediate advanced].each do |level|
      rr = RouteRequest.new(valid_attrs.merge(level: level))
      assert rr.valid?, "Level '#{level}' should be valid"
    end
  end

  test "invalid level rejected" do
    rr = RouteRequest.new(valid_attrs.merge(level: "expert"))
    assert_not rr.valid?
  end

  # --- Goal validation ---

  test "all goals are valid" do
    %w[career personal exam project switch teaching].each do |goal|
      rr = RouteRequest.new(valid_attrs.merge(goals: [goal]))
      assert rr.valid?, "Goal '#{goal}' should be valid"
    end
  end

  test "invalid goal rejected" do
    rr = RouteRequest.new(valid_attrs.merge(goals: ["invalid_goal"]))
    assert_not rr.valid?
  end

  # --- Pace validation ---

  test "all paces are valid" do
    %w[relaxed steady intensive].each do |pace|
      rr = RouteRequest.new(valid_attrs.merge(pace: pace))
      assert rr.valid?, "Pace '#{pace}' should be valid"
    end
  end

  # --- Weekly hours / session minutes validation ---

  test "weekly_hours must be positive" do
    rr = RouteRequest.new(valid_attrs.merge(weekly_hours: 0))
    assert_not rr.valid?
    assert rr.errors[:weekly_hours].any?
  end

  test "weekly_hours must not exceed 168" do
    rr = RouteRequest.new(valid_attrs.merge(weekly_hours: 169))
    assert_not rr.valid?
  end

  test "weekly_hours accepts nil" do
    rr = RouteRequest.new(valid_attrs.merge(weekly_hours: nil))
    assert rr.valid?
  end

  test "weekly_hours accepts valid value" do
    rr = RouteRequest.new(valid_attrs.merge(weekly_hours: 10))
    assert rr.valid?
  end

  test "session_minutes must be positive" do
    rr = RouteRequest.new(valid_attrs.merge(session_minutes: 0))
    assert_not rr.valid?
  end

  test "session_minutes must not exceed 480" do
    rr = RouteRequest.new(valid_attrs.merge(session_minutes: 481))
    assert_not rr.valid?
  end

  test "session_minutes accepts valid value" do
    rr = RouteRequest.new(valid_attrs.merge(session_minutes: 30))
    assert rr.valid?
  end

  # --- Custom topic length ---

  test "custom_topic rejects over 200 chars" do
    rr = RouteRequest.new(valid_attrs.merge(topics: [], custom_topic: "x" * 201))
    assert_not rr.valid?
    assert rr.errors[:custom_topic].any?
  end

  test "custom_topic accepts 200 chars" do
    rr = RouteRequest.new(valid_attrs.merge(topics: [], custom_topic: "x" * 200))
    assert rr.valid?
  end

  # --- Learning style ---

  test "incomplete style answers (less than 6) are invalid" do
    rr = RouteRequest.new(valid_attrs.merge(
      learning_style_answers: { "1" => "1v", "2" => "2a", "3" => "3r" }
    ))
    assert_not rr.valid?
    assert rr.errors[:learning_style_answers].any?
  end

  test "complete 6 style answers are valid" do
    rr = RouteRequest.new(valid_attrs.merge(
      learning_style_answers: { "1" => "1v", "2" => "2a", "3" => "3r", "4" => "4k", "5" => "5v", "6" => "6a" }
    ))
    assert rr.valid?
  end

  test "style result is calculated on save when all 6 answers present" do
    rr = RouteRequest.new(valid_attrs.merge(
      learning_style_answers: { "1" => "1v", "2" => "2v", "3" => "3v", "4" => "4v", "5" => "5a", "6" => "6a" }
    ))
    rr.save!
    assert_not_nil rr.learning_style_result
    assert_equal "visual", rr.learning_style_result["dominant"]
  end

  test "content_mix never has negative values" do
    # All kinesthetic — should have high interactive, low audio/text with minimums
    rr = RouteRequest.new(valid_attrs.merge(
      learning_style_answers: { "1" => "1k", "2" => "2k", "3" => "3k", "4" => "4k", "5" => "5k", "6" => "6k" }
    ))
    rr.save!
    mix = rr.learning_style_result["content_mix"]
    assert mix.values.all? { |v| v >= 0 }, "Content mix has negative values: #{mix}"
    assert_equal 100, mix.values.sum, "Content mix does not sum to 100: #{mix}"
  end

  # --- Status helpers ---

  test "status helpers work correctly" do
    rr = RouteRequest.new(valid_attrs.merge(status: "pending"))
    assert_not rr.generating?
    assert_not rr.completed?
    assert_not rr.failed?

    rr.status = "generating"
    assert rr.generating?

    rr.status = "completed"
    assert rr.completed?

    rr.status = "failed"
    assert rr.failed?
  end

  # --- topic_display ---

  test "topic_display returns labels for standard topics" do
    rr = RouteRequest.new(valid_attrs.merge(topics: ["programming", "web_dev"]))
    display = rr.topic_display
    assert_includes display, "Programación"
    assert_includes display, "Desarrollo Web"
  end

  test "topic_display includes custom topic" do
    rr = RouteRequest.new(valid_attrs.merge(custom_topic: "Quantum Computing"))
    display = rr.topic_display
    assert_includes display, "Quantum Computing"
  end
end
