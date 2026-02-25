module CommunityEngine
  class FeedController < ApplicationController
    def index
      @tab = params[:tab] || "all"

      @activities = case @tab
      when "following"
        Activity.from_followed_users(current_user).recent.includes(:user, :trackable).limit(30)
      when "trending"
        @trending_routes = SharedRoute.trending_today.includes(:learning_route, :user).limit(20)
        Activity.none
      else
        Activity.recent.includes(:user, :trackable).limit(30)
      end

      @top_learners = Core::User
        .joins("INNER JOIN learning_routes_engine_learning_profiles ON learning_routes_engine_learning_profiles.user_id = core_users.id")
        .joins("INNER JOIN learning_routes_engine_learning_routes ON learning_routes_engine_learning_routes.learning_profile_id = learning_routes_engine_learning_profiles.id")
        .joins("INNER JOIN learning_routes_engine_route_steps ON learning_routes_engine_route_steps.learning_route_id = learning_routes_engine_learning_routes.id")
        .where(learning_routes_engine_route_steps: { status: 3 })
        .group("core_users.id")
        .order(Arel.sql("count(*) DESC"))
        .limit(5)

      @stats = {
        total_users: Core::User.count,
        total_routes: LearningRoutesEngine::LearningRoute.where(status: "active").count,
        total_shared: SharedRoute.publicly_visible.count
      }
    end

    def following
      @activities = Activity.from_followed_users(current_user).recent.includes(:user, :trackable).limit(30)
      render partial: "community_engine/feed/activity_list", locals: { activities: @activities }
    end

    def trending
      @trending_routes = SharedRoute.trending_today.includes(:learning_route, :user).limit(20)
      render partial: "community_engine/feed/trending_list", locals: { trending_routes: @trending_routes }
    end
  end
end
