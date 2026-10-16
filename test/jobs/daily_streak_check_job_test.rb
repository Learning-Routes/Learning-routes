require "test_helper"

# STEP 37 §5. The job does not judge streaks — StreakService breaks or freezes a
# streak lazily on the next activity. The job's whole duty is to give back the
# daily freeze flag, and nothing else about the engagement may move.
class DailyStreakCheckJobTest < ActiveJob::TestCase
  test "clears the day's freeze flag, leaves streaks alone, and a second run changes nothing" do
    froze = UserEngagement.create!(user: create_test_user, current_streak: 7, longest_streak: 9,
                                   last_activity_date: 2.days.ago.to_date, streak_freeze_used_today: true)
    active = UserEngagement.create!(user: create_test_user, current_streak: 3, longest_streak: 3,
                                    last_activity_date: Date.current, streak_freeze_used_today: false)

    DailyStreakCheckJob.perform_now

    assert_not froze.reload.streak_freeze_used_today
    assert_equal [7, 9], [froze.current_streak, froze.longest_streak]
    assert_equal 3, active.reload.current_streak

    stamp = froze.updated_at
    DailyStreakCheckJob.perform_now
    assert_equal stamp, froze.reload.updated_at
    assert_equal 7, froze.current_streak
  end
end
