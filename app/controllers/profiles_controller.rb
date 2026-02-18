class ProfilesController < ApplicationController
  before_action :authenticate_user!

  def show
    @user = current_user
    @profile = LearningRoutesEngine::LearningProfile.find_by(user: @user)

    # Turbo Frame tab requests — load only needed data
    case params[:tab]
    when "achievements"
      load_achievements_data
      render partial: "profiles/achievements_frame", formats: [:html] and return
    when "activity"
      load_activity_data
      render partial: "profiles/activity_frame", formats: [:html] and return
    end

    # Full page load
    @routes = @profile&.learning_routes&.includes(:route_steps)&.order(updated_at: :desc) || []
    @active_routes = @routes.select(&:active?)
    @completed_routes = @routes.select(&:completed?)

    # Stats
    @total_steps_completed = @routes.sum { |r| r.route_steps.count(&:completed?) }
    @total_steps = @routes.sum(&:total_steps)
    @study_minutes = Analytics::StudySession.for_user(@user).sum(:duration_minutes)
    @assessment_results = Assessments::AssessmentResult.for_user(@user)
    @avg_accuracy = @assessment_results.any? ? @assessment_results.average(:score).to_f.round(1) : 0

    # XP calculation (10 per completed step, 25 per passed assessment, 1 per study minute)
    passed_assessments = @assessment_results.passed.count
    @xp = (@total_steps_completed * 10) + (passed_assessments * 25) + @study_minutes
    @level = xp_level(@xp)
    @xp_for_current_level = xp_threshold(@level)
    @xp_for_next_level = xp_threshold(@level + 1)
    @xp_progress = if @xp_for_next_level > @xp_for_current_level
                     ((@xp - @xp_for_current_level).to_f / (@xp_for_next_level - @xp_for_current_level) * 100).round(1)
                   else
                     100
                   end

    # Streak
    @streak = calculate_streak
    @member_since = @user.created_at
  end

  private

  # --- Tab data loaders (for Turbo Frame requests) ---

  def load_achievements_data
    @routes = @profile&.learning_routes&.includes(:route_steps)&.order(updated_at: :desc) || []
    @completed_routes = @routes.select(&:completed?)
    @total_steps_completed = @routes.sum { |r| r.route_steps.count(&:completed?) }
    @study_minutes = Analytics::StudySession.for_user(@user).sum(:duration_minutes)
    @assessment_results = Assessments::AssessmentResult.for_user(@user)
    @avg_accuracy = @assessment_results.any? ? @assessment_results.average(:score).to_f.round(1) : 0
    @streak = calculate_streak
  end

  def load_activity_data
    @routes = @profile&.learning_routes&.includes(:route_steps)&.order(updated_at: :desc) || []
  end

  # --- XP helpers ---

  def xp_threshold(level)
    (level * level * 50)
  end

  def xp_level(xp)
    level = 1
    level += 1 while xp >= xp_threshold(level + 1)
    level
  end

  def calculate_streak
    dates = Analytics::StudySession
              .for_user(current_user)
              .completed
              .where("started_at >= ?", 60.days.ago)
              .pluck(:started_at)
              .map { |t| t.to_date }
              .uniq
              .sort
              .reverse

    streak = 0
    check_date = Date.current

    if dates.include?(check_date)
      streak = 1
      check_date -= 1.day
    elsif dates.include?(check_date - 1.day)
      streak = 1
      check_date -= 2.days
    else
      return 0
    end

    dates.each do |d|
      next if d > check_date
      if d == check_date
        streak += 1
        check_date -= 1.day
      else
        break
      end
    end

    streak
  end
end
