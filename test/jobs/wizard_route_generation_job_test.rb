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
      learning_style_answers: { "1" => "1v", "2" => "2a", "3" => "3r", "4" => "4k", "5" => "5v", "6" => "6a", "7" => "7r", "8" => "8k", "9" => "9v", "10" => "10a", "11" => "11r", "12" => "12k" }
    }.merge(overrides))
  end

  # Reload a request and opt that one record out of strict loading.
  #
  # These tests assert on the job's OUTPUT by traversing the association the job
  # assigned (`request.update!(learning_route: route)`), which is behaviour
  # verification, not an N+1 — the job itself never lazily loads it. test.rb runs
  # strict_loading_by_default with mode :all so the suite gates the /routes/create
  # class of bug; scope the exemption to the assertion rather than switching the
  # guard off suite-wide.
  def reload_for_assertions(record)
    record.reload.tap { |r| r.strict_loading!(false) }
  end

  test "generates a learning route from a route request" do
    rr = create_request

    WizardRouteGenerationJob.perform_now(rr.id)

    reload_for_assertions(rr)
    assert_equal "completed", rr.status
    assert_not_nil rr.learning_route
    assert rr.learning_route.route_steps.count > 0
  end

  test "sets status to generating then completed" do
    rr = create_request
    WizardRouteGenerationJob.perform_now(rr.id)
    reload_for_assertions(rr)
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
    reload_for_assertions(rr)

    formats = rr.learning_route.route_steps.pluck(:delivery_format)
    assert formats.all? { |f| %w[audio text interactive mixed].include?(f) }
  end

  test "route locale matches user locale" do
    @user.update(locale: "es")
    rr = create_request
    WizardRouteGenerationJob.perform_now(rr.id)
    reload_for_assertions(rr)

    assert_equal "es", rr.learning_route.locale
    @user.update(locale: "en")
  end

  test "route has bilingual translations" do
    rr = create_request
    WizardRouteGenerationJob.perform_now(rr.id)
    reload_for_assertions(rr)

    translations = rr.learning_route.translations
    assert translations.key?("en"), "Missing EN translations"
    assert translations.key?("es"), "Missing ES translations"
  end

  test "first step is available, rest are locked" do
    rr = create_request
    WizardRouteGenerationJob.perform_now(rr.id)
    reload_for_assertions(rr)

    steps = rr.learning_route.route_steps.order(:position)
    assert_equal "available", steps.first.status
    steps[1..].each do |step|
      assert_equal "locked", step.status
    end
  end

  test "persists one multi-step preview and visible outline-only paid modules" do
    rr = create_request
    WizardRouteGenerationJob.perform_now(rr.id)
    route = reload_for_assertions(rr).learning_route
    modules = LearningRoutesEngine::RouteModule.where(learning_route_id: route.id).order(:position).to_a

    assert_operator modules.size, :>, 1
    assert modules.first.access_preview?
    assert modules.first.generation_generating?
    assert modules.drop(1).all?(&:access_locked?)
    assert modules.drop(1).all?(&:generation_outlined?)
    assert_operator LearningRoutesEngine::RouteStep.where(route_module_id: modules.first.id).count, :>, 1
    assert_empty ContentEngine::AiContent.where(
      route_step_id: LearningRoutesEngine::RouteStep.where(route_module_id: modules.drop(1).map(&:id)).select(:id)
    )
    assert_equal "estimator_configuration_missing", route.generation_params.fetch("quote_blocked_reason")
  end

  test "uses session_minutes for step duration" do
    rr = create_request(session_minutes: 15)
    WizardRouteGenerationJob.perform_now(rr.id)
    reload_for_assertions(rr)

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

    reload_for_assertions(rr)
    assert_equal "failed", rr.status
    assert_match(/Simulated failure/, rr.error_message)
  end
end
