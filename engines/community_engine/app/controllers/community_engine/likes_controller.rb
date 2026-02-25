module CommunityEngine
  class LikesController < ApplicationController
    ALLOWED_LIKEABLE_TYPES = %w[
      LearningRoutesEngine::LearningRoute
      LearningRoutesEngine::RouteStep
      CommunityEngine::SharedRoute
      CommunityEngine::Comment
    ].freeze

    def toggle
      likeable_type = params[:likeable_type]
      likeable_id = params[:likeable_id]

      unless likeable_type.in?(ALLOWED_LIKEABLE_TYPES)
        return head(:bad_request)
      end

      likeable = likeable_type.constantize.find(likeable_id)

      # Authorization: only allow liking accessible resources
      return head(:forbidden) unless can_like?(likeable)

      existing_like = Like.find_by(user: current_user, likeable_type: likeable_type, likeable_id: likeable_id)

      if existing_like
        existing_like.destroy
        @liked = false
      else
        Like.create!(user: current_user, likeable: likeable)
        @liked = true

        ActivityTracker.track!(user: current_user, action: "liked", trackable: likeable)

        owner = find_likeable_owner(likeable)
        if owner && owner != current_user
          NotificationService.notify!(
            user: owner,
            actor: current_user,
            notifiable: likeable,
            notification_type: "new_like"
          )
        end
      end

      @likeable = likeable
      @likes_count = likeable.likes.count

      respond_to do |format|
        format.turbo_stream {
          render turbo_stream: turbo_stream.replace(
            "like_button_#{likeable_type.parameterize}_#{likeable_id}",
            partial: "community_engine/likes/button",
            locals: { likeable: @likeable, liked: @liked, likes_count: @likes_count }
          )
        }
        format.json { render json: { liked: @liked, likes_count: @likes_count } }
      end
    end

    private

    def can_like?(likeable)
      case likeable
      when CommunityEngine::SharedRoute
        likeable.visibility == "public" || likeable.user_id == current_user.id
      when CommunityEngine::Comment
        true
      when LearningRoutesEngine::LearningRoute
        likeable.learning_profile&.user_id == current_user.id
      when LearningRoutesEngine::RouteStep
        likeable.learning_route&.learning_profile&.user_id == current_user.id
      else
        false
      end
    end

    def find_likeable_owner(likeable)
      case likeable
      when LearningRoutesEngine::LearningRoute
        likeable.learning_profile&.user
      when LearningRoutesEngine::RouteStep
        likeable.learning_route&.learning_profile&.user
      when CommunityEngine::SharedRoute
        likeable.user
      when CommunityEngine::Comment
        likeable.user
      end
    end
  end
end
