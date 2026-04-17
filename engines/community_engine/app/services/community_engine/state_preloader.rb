module CommunityEngine
  # Batches per-request community-state lookups (likes, ratings, best comments)
  # for a list of records to avoid N+1 queries in feed/profile views.
  #
  # Usage:
  #   CommunityEngine::StatePreloader.new(current_user).preload(
  #     likeables: [shared_routes, posts, comments].flatten,
  #     rateables: shared_routes,
  #     best_comments_for: shared_routes
  #   )
  #
  # After calling this, #liked_by?, #rated_by?, #user_rating, #best_comment on the
  # passed-in records read from memoized state instead of hitting the DB per call.
  class StatePreloader
    def initialize(user)
      @user = user
    end

    def preload(likeables: [], rateables: [], best_comments_for: [])
      preload_likes(Array(likeables).compact)
      preload_ratings(Array(rateables).compact)
      preload_best_comments(Array(best_comments_for).compact)
    end

    private

    def preload_likes(records)
      return if records.empty?

      grouped = records.group_by { |r| r.class.base_class.to_s }
      grouped.each do |type_name, items|
        liked_ids = if @user
          Like.where(
            user_id: @user.id,
            likeable_type: type_name,
            likeable_id: items.map(&:id)
          ).pluck(:likeable_id).to_set
        else
          Set.new
        end

        items.each do |item|
          item.instance_variable_set(:@_liked_by_cached, liked_ids.include?(item.id))
          item.instance_variable_set(:@_liked_by_cached_user_id, @user&.id)
        end
      end
    end

    def preload_ratings(shared_routes)
      return if shared_routes.empty?

      scores_by_route = if @user
        Rating.where(user_id: @user.id, shared_route_id: shared_routes.map(&:id))
              .pluck(:shared_route_id, :score).to_h
      else
        {}
      end

      shared_routes.each do |sr|
        sr.instance_variable_set(:@_user_rating_cached, scores_by_route[sr.id])
        sr.instance_variable_set(:@_user_rating_cached_user_id, @user&.id)
      end
    end

    def preload_best_comments(shared_routes)
      return if shared_routes.empty?

      ids = shared_routes.map(&:id)
      # For each shared route, pick one popular top-level comment
      # DISTINCT ON picks the first row per partition — O(one query)
      rows = Comment
        .select("DISTINCT ON (commentable_id) commentable_id, community_engine_comments.*")
        .where(commentable_type: "CommunityEngine::SharedRoute",
               commentable_id: ids,
               parent_id: nil)
        .order(Arel.sql("commentable_id, likes_count DESC, created_at DESC"))
        .includes(:user)

      by_route = rows.index_by(&:commentable_id)

      shared_routes.each do |sr|
        sr.instance_variable_set(:@_best_comment_cached, by_route[sr.id])
        sr.instance_variable_set(:@_best_comment_preloaded, true)
      end
    end
  end
end
