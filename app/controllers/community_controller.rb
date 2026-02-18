class CommunityController < ApplicationController
  def show
    @top_learners = load_top_learners
    @popular_routes = load_popular_routes
    @recent_completions = load_recent_completions
    @total_users = Core::User.count
    @total_routes = LearningRoutesEngine::LearningRoute.count
    @total_steps_completed = LearningRoutesEngine::RouteStep.completed_steps.count
    @total_study_hours = (Analytics::StudySession.sum(:duration_minutes).to_f / 60).round
  end

  private

  def load_top_learners
    Core::User
      .joins("INNER JOIN learning_routes_engine_learning_profiles ON learning_routes_engine_learning_profiles.user_id = core_users.id")
      .joins("INNER JOIN learning_routes_engine_learning_routes ON learning_routes_engine_learning_routes.learning_profile_id = learning_routes_engine_learning_profiles.id")
      .joins("INNER JOIN learning_routes_engine_route_steps ON learning_routes_engine_route_steps.learning_route_id = learning_routes_engine_learning_routes.id AND learning_routes_engine_route_steps.status = 3")
      .select("core_users.*, COUNT(learning_routes_engine_route_steps.id) as steps_count")
      .group("core_users.id")
      .order("steps_count DESC")
      .limit(8)
  end

  def load_popular_routes
    LearningRoutesEngine::LearningRoute
      .where(status: :active)
      .includes(:route_steps)
      .order(created_at: :desc)
      .limit(6)
  end

  def load_recent_completions
    LearningRoutesEngine::RouteStep
      .completed_steps
      .where.not(completed_at: nil)
      .includes(learning_route: { learning_profile: :user })
      .order(completed_at: :desc)
      .limit(10)
  end
end
