require "test_helper"

class ReapStaleRouteRequestsJobTest < ActiveJob::TestCase
  def setup
    @user = Core::User.create!(
      name: "Reaper Test",
      email: "reaper-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      email_verified_at: Time.current
    )
  end

  def create_request(status:, age: nil)
    rr = RouteRequest.create!(
      user: @user, topics: ["programming"], level: "beginner",
      pace: "steady", goals: ["career"], status: status
    )
    rr.update_column(:created_at, age.ago) if age
    rr
  end

  test "fails out requests stuck past STALE_AFTER" do
    stale = create_request(status: "pending", age: RouteRequest::STALE_AFTER + 5.minutes)

    ReapStaleRouteRequestsJob.perform_now

    stale.reload
    assert_equal "failed", stale.status
    assert_match(/timed out/, stale.error_message)
  end

  test "reaps generating requests too, not just pending" do
    stale = create_request(status: "generating", age: RouteRequest::STALE_AFTER + 5.minutes)

    ReapStaleRouteRequestsJob.perform_now

    assert_equal "failed", stale.reload.status
  end

  test "leaves in-flight requests alone" do
    fresh = create_request(status: "generating")

    ReapStaleRouteRequestsJob.perform_now

    assert_equal "generating", fresh.reload.status
  end

  test "does not touch terminal statuses" do
    old_completed = create_request(status: "completed", age: RouteRequest::STALE_AFTER + 1.day)

    ReapStaleRouteRequestsJob.perform_now

    assert_equal "completed", old_completed.reload.status
  end

  test "reaping unblocks the wizard for that user" do
    create_request(status: "pending", age: RouteRequest::STALE_AFTER + 5.minutes)

    assert_empty @user.route_requests.active, "stale request must not count as in-flight"

    ReapStaleRouteRequestsJob.perform_now

    assert_empty @user.route_requests.pending_or_generating
  end
end
