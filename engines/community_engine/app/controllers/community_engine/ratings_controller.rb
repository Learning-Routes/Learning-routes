module CommunityEngine
  class RatingsController < ApplicationController
    def create
      @shared_route = SharedRoute.find_by!(share_token: params[:id])

      # Only allow rating public/unlisted routes that you don't own
      unless @shared_route.visibility.in?(%w[public unlisted]) || @shared_route.user_id == current_user.id
        return head(:forbidden)
      end

      existing = @shared_route.ratings.find_by(user_id: current_user.id)
      score = params[:score].to_i

      if existing
        existing.update!(score: score)
        @rating = existing
      else
        @rating = @shared_route.ratings.create!(user_id: current_user.id, score: score)
      end

      @shared_route.reload

      respond_to do |format|
        format.turbo_stream do
          render turbo_stream: turbo_stream.replace(
            "rating_#{@shared_route.share_token}",
            partial: "community_engine/ratings/stars",
            locals: { shared_route: @shared_route, interactive: true }
          )
        end
        format.json do
          render json: {
            average_rating: @shared_route.average_rating,
            ratings_count: @shared_route.ratings_count,
            user_score: score
          }
        end
        format.html { redirect_back fallback_location: community_engine.shared_route_path(@shared_route) }
      end
    end
  end
end
