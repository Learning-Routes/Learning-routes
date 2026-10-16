require "test_helper"

# STEP 37 §5: sessions idle past the 30-day window are deleted; a recent one survives.
class Core::SessionCleanupJobTest < ActiveJob::TestCase
  test "deletes a session idle 31 days and keeps a 29-day one" do
    user = create_test_user
    stale = user.sessions.create!(last_active_at: 31.days.ago)
    recent = user.sessions.create!(last_active_at: 29.days.ago)

    Core::SessionCleanupJob.perform_now

    assert_not Core::Session.exists?(stale.id)
    assert Core::Session.exists?(recent.id)
  end
end
