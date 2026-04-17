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

      # Preload learning_route for SharedRoute trackables to avoid N+1
      preload_shared_route_associations(@activities)

      # Batch-preload likes/ratings/best-comment state for all visible records
      preload_community_state

      # Leaderboard: cache the IDs (1 hour). Resolve User records outside the cache
      # so Rails doesn't serialize/deserialize full AR objects.
      top_learner_ids = Rails.cache.fetch("community_feed_top_learners_v1", expires_in: 1.hour) do
        Core::User
          .joins("INNER JOIN learning_routes_engine_learning_profiles ON learning_routes_engine_learning_profiles.user_id = core_users.id")
          .joins("INNER JOIN learning_routes_engine_learning_routes ON learning_routes_engine_learning_routes.learning_profile_id = learning_routes_engine_learning_profiles.id")
          .joins("INNER JOIN learning_routes_engine_route_steps ON learning_routes_engine_route_steps.learning_route_id = learning_routes_engine_learning_routes.id")
          .where(learning_routes_engine_route_steps: { status: 3 })
          .group("core_users.id")
          .order(Arel.sql("count(*) DESC"))
          .limit(5)
          .pluck(:id)
      end
      @top_learners = top_learner_ids.any? ? Core::User.where(id: top_learner_ids).index_by(&:id).values_at(*top_learner_ids).compact : []

      # Community posts
      @posts = Post.recent.includes(:user).limit(20)

      # Floating thoughts: best comments from shared routes
      @floating_thoughts = build_floating_thoughts

      @stats = Rails.cache.fetch("community_feed_stats", expires_in: 1.hour) do
        {
          total_users: Core::User.count,
          total_routes: LearningRoutesEngine::LearningRoute.where(status: :active).count,
          total_shared: SharedRoute.publicly_visible.count
        }
      end
    end

    def following
      @activities = Activity.by_action("shared").from_followed_users(current_user).recent.includes(:user, :trackable).limit(30)
      preload_shared_route_associations(@activities)
      render partial: "community_engine/feed/activity_list", locals: { activities: @activities }
    end

    def trending
      @trending_routes = SharedRoute.trending_today.includes(:learning_route, :user).limit(20)
      render partial: "community_engine/feed/trending_list", locals: { trending_routes: @trending_routes }
    end

    private

    def preload_shared_route_associations(activities)
      shared_routes = activities.filter_map { |a| a.trackable if a.trackable.is_a?(SharedRoute) }
      ActiveRecord::Associations::Preloader.new(records: shared_routes, associations: :learning_route).call if shared_routes.any?
    end

    def preload_community_state
      shared_routes_in_feed = (@activities || []).filter_map { |a| a.trackable if a.trackable.is_a?(SharedRoute) }
      shared_routes_trending = @trending_routes || []
      all_shared_routes = (shared_routes_in_feed + shared_routes_trending).uniq(&:id)
      posts = @posts || []

      CommunityEngine::StatePreloader.new(current_user).preload(
        likeables: all_shared_routes + posts,
        rateables: all_shared_routes,
        best_comments_for: all_shared_routes
      )
    end

    def build_floating_thoughts
      # Cache the rendered hash (30 min). Includes locale so bilingual topic labels stay correct.
      Rails.cache.fetch("community_floating_thoughts_v1:#{I18n.locale}", expires_in: 30.minutes) do
        top_comments = Comment
          .where(commentable_type: "CommunityEngine::SharedRoute")
          .joins("INNER JOIN community_engine_likes ON community_engine_likes.likeable_type = 'CommunityEngine::Comment' AND community_engine_likes.likeable_id = community_engine_comments.id")
          .group("community_engine_comments.id")
          .order(Arel.sql("COUNT(community_engine_likes.id) DESC"))
          .limit(6)
          .includes(:user, commentable: :learning_route)

        # Fallback to recent comments if no liked ones exist
        if top_comments.empty?
          top_comments = Comment
            .where(commentable_type: "CommunityEngine::SharedRoute")
            .order(created_at: :desc)
            .limit(6)
            .includes(:user, commentable: :learning_route)
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
end
