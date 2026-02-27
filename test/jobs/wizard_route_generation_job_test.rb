require "test_helper"

class WizardRouteGenerationJobTest < ActiveSupport::TestCase
  def setup
    @user = Core::User.first || Core::User.create!(
      name: "Test User",
      email: "test-job@example.com",
      password: "password123",
      password_confirmation: "password123"
    )
  end

  def create_request(overrides = {})
    RouteRequest.create!({
      user: @user,
      topics: ["programming"],
      level: "beginner",
      pace: "steady",
      goals: ["career"],
      status: "pending",
      learning_style_answers: { "1" => "1v", "2" => "2a", "3" => "3r", "4" => "4k", "5" => "5v", "6" => "6a" }
    }.merge(overrides))
  end

  test "generates a learning route from a route request" do
    rr = create_request

    WizardRouteGenerationJob.perform_now(rr.id)

    rr.reload
    assert_equal "completed", rr.status
    assert_not_nil rr.learning_route
    assert rr.learning_route.route_steps.count > 0
  end

  test "sets status to generating then completed" do
    rr = create_request
    WizardRouteGenerationJob.perform_now(rr.id)
    rr.reload
    assert_equal "completed", rr.status
  end

  test "skips already completed requests" do
    rr = create_request
    rr.update!(status: "completed")

    assert_nothing_raised do
      WizardRouteGenerationJob.perform_now(rr.id)
    end
  end

  test "creates learning profile for new user" do
    # Ensure no profile exists
    LearningRoutesEngine::LearningProfile.where(user: @user).destroy_all

    rr = create_request
    WizardRouteGenerationJob.perform_now(rr.id)

    profile = LearningRoutesEngine::LearningProfile.find_by(user: @user)
    assert_not_nil profile
    assert_equal "beginner", profile.current_level
  end

  test "updates weekly_hours and session_minutes on profile" do
    rr = create_request(weekly_hours: 10, session_minutes: 30)
    WizardRouteGenerationJob.perform_now(rr.id)

    profile = LearningRoutesEngine::LearningProfile.find_by(user: @user)
    assert_equal 10, profile.weekly_hours
    assert_equal 30, profile.session_minutes
  end

  test "route steps have correct delivery formats" do
    rr = create_request
    WizardRouteGenerationJob.perform_now(rr.id)
    rr.reload

    formats = rr.learning_route.route_steps.pluck(:delivery_format)
    assert formats.all? { |f| %w[audio text interactive mixed].include?(f) }
  end

  test "route locale matches user locale" do
    @user.update(locale: "es")
    rr = create_request
    WizardRouteGenerationJob.perform_now(rr.id)
    rr.reload

    assert_equal "es", rr.learning_route.locale
    @user.update(locale: "en")
  end

  test "route has bilingual translations" do
    rr = create_request
    WizardRouteGenerationJob.perform_now(rr.id)
    rr.reload

    translations = rr.learning_route.translations
    assert translations.key?("en"), "Missing EN translations"
    assert translations.key?("es"), "Missing ES translations"
  end

  test "first step is available, rest are locked" do
    rr = create_request
    WizardRouteGenerationJob.perform_now(rr.id)
    rr.reload

    steps = rr.learning_route.route_steps.order(:position)
    assert_equal "available", steps.first.status
    steps[1..].each do |step|
      assert_equal "locked", step.status
    end
  end

  test "uses session_minutes for step duration" do
    rr = create_request(session_minutes: 15)
    WizardRouteGenerationJob.perform_now(rr.id)
    rr.reload

    max_minutes = rr.learning_route.route_steps.maximum(:estimated_minutes)
    assert max_minutes <= 15, "Steps should not exceed session_minutes (15), got #{max_minutes}"
  end

  test "marks request as failed on error inside generation" do
    rr = create_request
    rr.update!(status: "generating")

    # Stub generate_fallback_route to raise an error
    job = WizardRouteGenerationJob.new
    job.define_singleton_method(:generate_fallback_route) { |_req, _locale| raise "Simulated failure" }

    # The job catches the error and marks as failed
    assert_nothing_raised do
      job.perform(rr.id)
    end

    rr.reload
    assert_equal "failed", rr.status
    assert_match(/Simulated failure/, rr.error_message)
  end
end
