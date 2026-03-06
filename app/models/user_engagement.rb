class UserEngagement < ApplicationRecord
  belongs_to :user, class_name: "Core::User"

  validates :current_streak, :longest_streak, :total_xp, :current_level,
            numericality: { greater_than_or_equal_to: 0 }
  validates :xp_to_next_level, numericality: { greater_than: 0 }
  validates :current_league, inclusion: { in: %w[bronze silver gold platinum diamond] }

  def level_progress_percentage
    needed = XpService.xp_for_level(current_level + 1)
    floor = current_level > 1 ? XpService.xp_for_level(current_level) : 0
    range = needed - floor
    return 100 if range <= 0

    progress = total_xp - floor
    ((progress.to_f / range) * 100).clamp(0, 100).round(1)
  end

  def active_today?
    last_activity_date == Date.current
  end

  def streak_active?
    return false if last_activity_date.nil?
    last_activity_date >= Date.current - 1
  end
end
