class StreakService
  def initialize(user)
    @user = user
    @engagement = user.user_engagement || user.create_user_engagement!
  end

  def record_activity!
    today = Date.current
    first_today = false
    streak_milestone = nil

    ActiveRecord::Base.transaction do
      @engagement.lock!
      return @engagement if @engagement.last_activity_date == today

      first_today = !@engagement.active_today?

      if @engagement.last_activity_date == today - 1
        @engagement.current_streak += 1
      elsif @engagement.last_activity_date == today - 2 &&
            @engagement.streak_freezes_available > 0 &&
            !@engagement.streak_freeze_used_today
        @engagement.streak_freezes_available -= 1
        @engagement.streak_freeze_used_today = true
        @engagement.current_streak += 1
      elsif @engagement.last_activity_date.nil? || @engagement.last_activity_date < today - 1
        @engagement.current_streak = 1
      end

      @engagement.last_activity_date = today
      @engagement.longest_streak = [@engagement.longest_streak, @engagement.current_streak].max

      # Capture milestone before save
      streak_milestone = find_streak_milestone(@engagement.current_streak)

      @engagement.save!
    end

    # Award XP outside the lock (each creates its own transaction)
    XpService.award(@user, XpService::XP_VALUES[:daily_first_lesson], "daily_first_lesson") if first_today

    if streak_milestone
      XpService.award(@user, XpService::XP_VALUES[streak_milestone], streak_milestone.to_s)
    end

    @engagement
  end

  private

  def find_streak_milestone(streak)
    { 7 => :streak_bonus_7, 30 => :streak_bonus_30, 100 => :streak_bonus_100 }[streak]
  end
end
