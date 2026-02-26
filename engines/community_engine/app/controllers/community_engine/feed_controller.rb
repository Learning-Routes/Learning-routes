module CommunityEngine
  class FeedController < ApplicationController
    def index
      @tab = params[:tab] || "all"

      # Only show "shared" activities in the feed (not likes, follows, comments, etc.)
      shared_only = Activity.by_action("shared")

      @activities = case @tab
      when "following"
        shared_only.from_followed_users(current_user).recent.includes(:user, :trackable).limit(30)
      when "trending"
        @trending_routes = SharedRoute.trending_today.includes(:learning_route, :user).limit(20)
        Activity.none
      else
        shared_only.recent.includes(:user, :trackable).limit(30)
      end

      @top_learners = Core::User
        .joins("INNER JOIN learning_routes_engine_learning_profiles ON learning_routes_engine_learning_profiles.user_id = core_users.id")
        .joins("INNER JOIN learning_routes_engine_learning_routes ON learning_routes_engine_learning_routes.learning_profile_id = learning_routes_engine_learning_profiles.id")
        .joins("INNER JOIN learning_routes_engine_route_steps ON learning_routes_engine_route_steps.learning_route_id = learning_routes_engine_learning_routes.id")
        .where(learning_routes_engine_route_steps: { status: 3 })
        .group("core_users.id")
        .order(Arel.sql("count(*) DESC"))
        .limit(5)

      # Community posts
      @posts = Post.recent.includes(:user).limit(20)

      # Floating thoughts: best comments from shared routes
      @floating_thoughts = build_floating_thoughts

      @stats = {
        total_users: Core::User.count,
        total_routes: LearningRoutesEngine::LearningRoute.where(status: "active").count,
        total_shared: SharedRoute.publicly_visible.count
      }
    end

    def following
      @activities = Activity.by_action("shared").from_followed_users(current_user).recent.includes(:user, :trackable).limit(30)
      render partial: "community_engine/feed/activity_list", locals: { activities: @activities }
    end

    def trending
      @trending_routes = SharedRoute.trending_today.includes(:learning_route, :user).limit(20)
      render partial: "community_engine/feed/trending_list", locals: { trending_routes: @trending_routes }
    end

    private

    def build_floating_thoughts
      top_comments = Comment
        .where(commentable_type: "CommunityEngine::SharedRoute")
        .joins("INNER JOIN community_engine_likes ON community_engine_likes.likeable_type = 'CommunityEngine::Comment' AND community_engine_likes.likeable_id = community_engine_comments.id")
        .group("community_engine_comments.id")
        .order(Arel.sql("COUNT(community_engine_likes.id) DESC"))
        .limit(6)
        .includes(:user, :commentable)

      # Fallback to recent comments if no liked ones exist
      if top_comments.empty?
        top_comments = Comment
          .where(commentable_type: "CommunityEngine::SharedRoute")
          .order(created_at: :desc)
          .limit(6)
          .includes(:user, :commentable)
      end

      top_comments.filter_map do |comment|
        shared_route = comment.commentable
        next unless shared_route.is_a?(CommunityEngine::SharedRoute)
        next unless comment.user
        {
          comment: comment.body,
          author_name: comment.user.name,
          route_topic: shared_route.learning_route&.localized_topic
        }
      end
    end
  end
end
