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

  # Weekly streak freeze: auto-offered if user played 5 of 7 days
  def eligible_for_streak_freeze?
    return false if streak_freeze_used_this_week?
    return false unless streak_lost_recently?

    active_days_this_week >= 5
  end

  def apply_streak_freeze!
    return false unless eligible_for_streak_freeze?

    update!(
      current_streak: current_streak + 1, # Restore the streak
      metadata: (metadata || {}).merge(
        "streak_freeze_used_at" => Time.current.iso8601,
        "streak_freeze_week" => Date.current.cweek
      )
    )
    true
  end

  private

  def streak_freeze_used_this_week?
    (metadata || {}).dig("streak_freeze_week") == Date.current.cweek
  end

  def streak_lost_recently?
    last_activity_date.present? && last_activity_date < Date.current && last_activity_date >= Date.current - 2
  end

  def active_days_this_week
    start_of_week = Date.current.beginning_of_week
    XpTransaction.where(user: user)
                 .where("created_at >= ?", start_of_week)
                 .select("DATE(created_at)")
                 .distinct
                 .count
  rescue
    0
  end
end
