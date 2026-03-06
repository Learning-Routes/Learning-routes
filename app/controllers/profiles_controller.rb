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

    # Pre-compute completed steps per route in a single query
    route_ids = @routes.map(&:id)
    completed_by_route = LearningRoutesEngine::RouteStep
      .where(learning_route_id: route_ids, status: :completed)
      .group(:learning_route_id)
      .count

    @total_steps_completed = completed_by_route.values.sum
    @total_steps = @routes.sum(&:total_steps)
    @study_minutes = Analytics::StudySession.for_user(@user).sum(:duration_minutes)
    @assessment_results = Assessments::AssessmentResult.for_user(@user)
    @avg_accuracy = @assessment_results.any? ? @assessment_results.average(:score).to_f.round(1) : 0

    # Per-route stats for route cards (no N+1)
    study_minutes_by_route = Analytics::StudySession.for_user(@user)
                               .where(learning_route_id: route_ids)
                               .group(:learning_route_id)
                               .sum(:duration_minutes)
    @route_stats = {}
    @routes.each do |r|
      @route_stats[r.id] = {
        study_minutes: study_minutes_by_route[r.id] || 0,
        lessons_completed: completed_by_route[r.id] || 0,
        accuracy: @avg_accuracy
      }
    end

    # Use engagement system for XP/level/streak
    engagement = @user.user_engagement
    if engagement
      @xp = engagement.total_xp
      @level = engagement.current_level
      @xp_for_current_level = @level > 1 ? XpService.xp_for_level(@level) : 0
      @xp_for_next_level = XpService.xp_for_level(@level + 1)
      @xp_progress = engagement.level_progress_percentage
      @streak = engagement.current_streak
    else
      @xp = 0
      @level = 1
      @xp_for_current_level = 0
      @xp_for_next_level = XpService.xp_for_level(2)
      @xp_progress = 0
      @streak = 0
    end
    @member_since = @user.created_at
    @followers_count = @user.followers_count
    @following_count = @user.following_count

    # Shared routes for the "Share My Routes" feature
    @shared_routes = current_user.shared_routes.includes(:learning_route).order(created_at: :desc)
    @shareable_routes = @routes.reject { |r| @shared_routes.any? { |sr| sr.learning_route_id == r.id } }
  end

  private

  def load_achievements_data
    @routes = @profile&.learning_routes&.includes(:route_steps)&.order(updated_at: :desc) || []
    @completed_routes = @routes.select(&:completed?)

    route_ids = @routes.map(&:id)
    completed_by_route = LearningRoutesEngine::RouteStep
      .where(learning_route_id: route_ids, status: :completed)
      .group(:learning_route_id)
      .count
    @total_steps_completed = completed_by_route.values.sum

    @study_minutes = Analytics::StudySession.for_user(@user).sum(:duration_minutes)
    @assessment_results = Assessments::AssessmentResult.for_user(@user)
    @avg_accuracy = @assessment_results.any? ? @assessment_results.average(:score).to_f.round(1) : 0
    @streak = @user.user_engagement&.current_streak || 0
  end

  def load_activity_data
    @routes = @profile&.learning_routes&.includes(:route_steps)&.order(updated_at: :desc) || []
  end
end
