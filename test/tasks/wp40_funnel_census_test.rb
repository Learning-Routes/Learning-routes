require "test_helper"
require "rake"
require "support/route_purchase_helpers"

# WP-40 Task 1. Read-only. It counts, per funnel stage, the users with evidence in
# production and the rows where a stage should carry a timestamp and does not, so
# spec §3's sources are confirmed from data before a bar is drawn from them.
class Wp40FunnelCensusTest < ActiveSupport::TestCase
  include RoutePurchaseHelpers

  TABLES = %w[
    core_users core_sessions route_requests learning_routes_engine_learning_profiles
    learning_routes_engine_learning_routes learning_routes_engine_route_modules
    learning_routes_engine_route_steps analytics_study_sessions assessments_assessments
    assessments_assessment_results commerce_route_purchases commerce_route_quotes
  ].freeze
  WRITE = /\A\s*(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT)\b/i

  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("wp40:funnel_census")
    @task = Rake::Task["wp40:funnel_census"]
    @task.reenable
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])

    @now = Time.current.change(usec: 0)
    # Registered only: password, unverified, English.
    @plain = user("Plain Census", created: @now - 2.days)
    # A Google signup, verified at creation, Spanish, through every stage.
    @google = user("Google Census", created: @now - 5.days, provider: "google_oauth2", uid: "g-1",
      verified: @now - 5.days, locale: "es", onboarded: true)
    # A password account that linked Google later: provider set, verified days after signup.
    @linked = user("Linked Census", created: @now - 10.days, provider: "google_oauth2", uid: "g-2",
      verified: @now - 9.days)
    # Onboarding flag without a profile row.
    @flag_only = user("Flag Census", created: @now - 3.days, onboarded: true, profile: false)
    # A clone, a failed request without a message, exams of every outcome.
    @cloner = user("Cloner Census", created: @now - 3.days, verified: @now - 3.days)
    @refunder = user("Refund Census", created: @now - 4.days, verified: @now - 4.days)

    request(@google, "completed", @now - 5.days + 1.hour)
    request(@cloner, "failed", @now - 3.days + 1.hour)
    request(@cloner, "failed", @now - 3.days + 2.hours, message: "Generation did not complete")

    route = generated_route(@google, created: @now - 5.days + 2.hours, generated: @now - 5.days + 3.hours)
    @clone = generated_route(@cloner, created: @now - 2.days, generated: @now - 30.days)
    generated_route(@refunder, created: @now - 4.days, generated: nil)
    @cloner.learning_profile.learning_routes.create!(topic: "Still generating", generation_status: "generating")

    first, second = steps(route, 2)
    first.update_columns(status: 3, completed_at: @now - 4.days)
    second.update_columns(status: 2) # opened, never recorded below
    # A step marked completed with no timestamp: the census must count it.
    clone_step, = steps(@clone, 1)
    clone_step.update_columns(status: 3, completed_at: nil)

    # 25 h after signup: a lesson opened on another day is a return (R5).
    @opened_at = @now - 4.days + 1.hour
    Analytics::StudySession.create!(user: @google, learning_route: route, route_step: first, started_at: @opened_at)
      .update_columns(created_at: @opened_at)

    final = assessment(first, :final)
    result(@google, final, score: 90, passed: true, at: @now - 4.days)
    result(@cloner, final, score: 40, passed: false, at: @now - 1.day)
    result(@cloner, final, score: 50, passed: false, at: @now - 1.hour)
    result(@cloner, assessment(first, :level_up), score: nil, passed: false, at: @now - 1.hour)
    result(@cloner, assessment(first, :step_quiz), score: 100, passed: true, at: @now - 1.hour)

    live = purchase_route!(route, user: @google, state: :paid)
    live.update_columns(test_mode: false, paid_at: @now - 3.days, created_at: @now - 3.days)
    refund_route = generated_route(@refunder, created: @now - 4.days, generated: @now - 4.days + 1.minute)
    refunded = purchase_route!(refund_route, user: @refunder, state: :refunded)
    refunded.update_columns(test_mode: false)
    purchase_route!(@clone, user: @cloner, state: :paid) # test mode: not a conversion

    session(@google, @now - 5.days)
    session(@google, @now - 2.days) # came back by session
    session(@plain, @now - 2.days)  # same day as signup: not a return
  end

  test "prints counts per stage and per split" do
    out = run_census

    assert_match(/^accounts: total=#{Core::User.count} owner=0 teacher=0$/, out)
    assert_match(/^1 registered: users=6$/, out)
    assert_match(/^  provider: google_oauth2=2 password=4 other=0$/, out)
    assert_match(/^  locale: en=5 es=1$/, out)
    assert_match(/^  linked: 1 \(provider set, verified more than 1 minute after signup or never\)$/, out)
    assert_match(/^2 verified: users=4 google_unverified=0$/, out)
    assert_match(/^3 onboarded: flag=2 profile=5 flag_without_profile=1 profile_without_flag=4$/, out)
    assert_match(/^4 route_requested: users=2 pending=0 generating=0 completed=1 failed=2 failed_without_message=1$/, out)
    assert_match(/^5 route_generated: users=3 completed=4 generating=1 failed=0 null=0 completed_without_generated_at=1 clones=1$/, out)
    assert_match(/^6 lesson_opened: users=1 sessions=1 without_step=0 oldest_started_at=#{@opened_at.utc.to_date}$/, out)
    assert_match(/^  writer: steps_opened_without_session=2 of 3 since_first_session=2 of 3$/, out)
    assert_match(/^7 step_completed: users=1 completed=2 completed_without_completed_at=1 completed_at_without_completed=0$/, out)
    assert_match(/^8 exam_passed: users=1$/, out)
    assert_match(/^  final: passed=1 failed=2 open=0$/, out)
    assert_match(/^  level_up: passed=0 failed=0 open=1$/, out)
    assert_match(/^  step_quiz: passed=1 failed=0 open=0$/, out)
    assert_match(/^9 paid: users=2 refunded_users=1$/, out)
    assert_match(/^  paid: live=1 test=1$/, out)
    assert_match(/^  refunded: live=1 test=0$/, out)
    assert_match(/^10 came_back: users=3 session=1 study_session=1 step=1 result=2 purchase=3$/, out)
    assert_match(/^  core_sessions: rows=3 oldest_created_at=#{(@now - 5.days).utc.to_date}$/, out)
  end

  test "writes nothing and changes no table it reads" do
    writes = []
    callback = ->(*, payload) { writes << payload[:sql] if payload[:sql].match?(WRITE) }

    assert_no_changes -> { snapshot } do
      ActiveSupport::Notifications.subscribed(callback, "sql.active_record") { run_census }
    end
    assert_empty writes
  end

  test "prints no email and no name" do
    out = run_census

    assert_no_match(/@/, out)
    Core::User.pluck(:name).each { |name| assert_no_match(/#{Regexp.escape(name)}/, out) }
  end

  private

  def run_census
    @task.reenable
    out, = capture_io { @task.invoke }
    out
  end

  def snapshot
    TABLES.to_h do |table|
      [table, ActiveRecord::Base.connection.select_rows("SELECT COUNT(*), MAX(updated_at) FROM #{table}")]
    end
  end

  def user(name, created:, provider: nil, uid: nil, verified: nil, locale: "en", onboarded: false, profile: onboarded)
    record = create_test_user(name: name, provider: provider, uid: uid, locale: locale)
    record.update_columns(created_at: created, email_verified_at: verified, onboarding_completed: onboarded)
    LearningRoutesEngine::LearningProfile.create!(user: record) if profile || !onboarded
    record.reload
  end

  def request(user, status, at, message: nil)
    RouteRequest.create!(user: user, level: "beginner", pace: "steady", custom_topic: "Census", status: status,
      error_message: message)
      .update_columns(created_at: at, updated_at: at)
  end

  def generated_route(user, created:, generated:)
    route = user.learning_profile.learning_routes.create!(topic: "Census route", generation_status: "completed",
      status: :active)
    route.update_columns(created_at: created, generated_at: generated)
    route
  end

  def steps(route, count)
    preview = route.route_modules.find_by!(access_state: :preview)
    Array.new(count) do |position|
      route.route_steps.create!(route_module: preview, position: position, title: "Census step #{position}",
        status: :available, content_type: :lesson, level: :nv1, bloom_level: 1)
    end
  end

  def assessment(step, type)
    Assessments::Assessment.create!(route_step: step, assessment_type: type, passing_score: 70)
  end

  def result(user, assessment, score:, passed:, at:)
    Assessments::AssessmentResult.create!(user: user, assessment: assessment, score: score, passed: passed)
      .update_columns(created_at: at)
  end

  def session(user, at)
    user.sessions.create!(last_active_at: at).update_columns(created_at: at)
  end
end
