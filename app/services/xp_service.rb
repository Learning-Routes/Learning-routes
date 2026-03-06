class XpService
  XP_VALUES = {
    lesson_complete: 10,
    lesson_perfect: 25,
    quiz_complete: 15,
    quiz_perfect: 40,
    step_complete: 50,
    route_complete: 200,
    streak_bonus_7: 50,
    streak_bonus_30: 200,
    streak_bonus_100: 500,
    daily_first_lesson: 5,
    speed_bonus: 10
  }.freeze

  def self.award(user, amount, source_type, source_id: nil, metadata: {})
    ActiveRecord::Base.transaction do
      engagement = user.user_engagement || user.create_user_engagement!
      engagement.lock!

      XpTransaction.create!(
        user: user,
        amount: amount,
        source_type: source_type,
        source_id: source_id,
        metadata: metadata
      )

      engagement.total_xp += amount

      # Track weekly XP
      week_key = Date.current.beginning_of_week.to_s
      engagement.weekly_xp[week_key] = (engagement.weekly_xp[week_key] || 0) + amount

      # Check level ups
      leveled_up = false
      while engagement.total_xp >= xp_for_level(engagement.current_level + 1)
        engagement.current_level += 1
        leveled_up = true
      end
      engagement.xp_to_next_level = xp_for_level(engagement.current_level + 1) - engagement.total_xp

      engagement.save!

      {
        xp_gained: amount,
        total_xp: engagement.total_xp,
        level: engagement.current_level,
        leveled_up: leveled_up,
        streak: engagement.current_streak,
        progress_pct: engagement.level_progress_percentage
      }
    end
  end

  def self.xp_for_level(level)
    (100 * (level**1.5)).round
  end
end
