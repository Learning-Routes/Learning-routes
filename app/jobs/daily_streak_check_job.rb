class DailyStreakCheckJob < ApplicationJob
  queue_as :low

  def perform
    UserEngagement.update_all(streak_freeze_used_today: false)
  end
end
