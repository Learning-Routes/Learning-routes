class DailyStreakCheckJob < ApplicationJob
  queue_as :low
  retry_on StandardError, wait: :polynomially_longer, attempts: 3

  def perform
    count = UserEngagement.where(streak_freeze_used_today: true).count
    UserEngagement.update_all(streak_freeze_used_today: false)
    Rails.logger.info("[DailyStreakCheckJob] Reset streak_freeze_used_today for #{count} users")
  end
end
