module CommunityEngine
  class CommentsController < ApplicationController
    before_action :set_comment, only: [:update, :destroy]

    ALLOWED_COMMENTABLE_TYPES = %w[
      LearningRoutesEngine::LearningRoute
      LearningRoutesEngine::RouteStep
      CommunityEngine::SharedRoute
      CommunityEngine::Post
    ].freeze

    def create
      @comment = Comment.new(comment_params)
      @comment.user = current_user

      # Validate commentable type whitelist
      unless @comment.commentable_type.in?(ALLOWED_COMMENTABLE_TYPES)
        return head(:bad_request)
      end

      # Authorization: verify user can comment on this resource
      return head(:forbidden) unless can_comment_on?(@comment.commentable)

      # Validate parent belongs to same commentable
      if @comment.parent_id.present?
        parent = Comment.find_by(id: @comment.parent_id)
        return head(:bad_request) unless parent && parent.commentable_id == @comment.commentable_id && parent.commentable_type == @comment.commentable_type
      end

      if @comment.save
        ActivityTracker.track!(
          user: current_user,
          action: "commented",
          trackable: @comment.commentable,
          metadata: { comment_id: @comment.id, preview: @comment.body.truncate(100) }
        )

        owner = find_commentable_owner(@comment)
        if owner && owner != current_user
          NotificationService.notify!(
            user: owner,
            actor: current_user,
            notifiable: @comment,
            notification_type: @comment.parent_id? ? "comment_reply" : "new_comment",
            metadata: { preview: @comment.body.truncate(100) }
          )
        end

        if @comment.parent.present? && @comment.parent.user_id != owner&.id && @comment.parent.user_id != current_user.id
          NotificationService.notify!(
            user: @comment.parent.user,
            actor: current_user,
            notifiable: @comment,
            notification_type: "comment_reply"
          )
        end

        respond_to do |format|
          format.turbo_stream
          format.html { redirect_back(fallback_location: main_app.root_path) }
        end
      else
        respond_to do |format|
          format.turbo_stream { render turbo_stream: turbo_stream.replace("comment_form_errors", partial: "community_engine/comments/errors", locals: { comment: @comment }) }
          format.html { redirect_back(fallback_location: main_app.root_path, alert: @comment.errors.full_messages.join(", ")) }
        end
      end
    end

    def update
      return head(:forbidden) unless @comment.owned_by?(current_user)

      if @comment.update(body: params[:comment][:body], edited_at: Time.current)
        respond_to do |format|
          format.turbo_stream
          format.html { redirect_back(fallback_location: main_app.root_path) }
        end
      else
        head :unprocessable_entity
      end
    end

    def destroy
      return head(:forbidden) unless @comment.owned_by?(current_user) || current_user.admin?

      @comment.destroy
      respond_to do |format|
        format.turbo_stream { render turbo_stream: turbo_stream.remove("comment_#{@comment.id}") }
        format.html { redirect_back(fallback_location: main_app.root_path) }
      end
    end

    private

    def set_comment
      @comment = Comment.find(params[:id])
    end

    def comment_params
      params.require(:comment).permit(:body, :commentable_type, :commentable_id, :parent_id)
    end

    def can_comment_on?(commentable)
      case commentable
      when CommunityEngine::SharedRoute
        commentable.visibility == "public" || commentable.user_id == current_user.id
      when CommunityEngine::Post
        true
      when LearningRoutesEngine::LearningRoute
        commentable.learning_profile&.user_id == current_user.id
      when LearningRoutesEngine::RouteStep
        commentable.learning_route&.learning_profile&.user_id == current_user.id
      else
        false
      end
    end

    def find_commentable_owner(comment)
      commentable = comment.commentable
      case commentable
      when LearningRoutesEngine::LearningRoute
        commentable.learning_profile&.user
      when LearningRoutesEngine::RouteStep
        commentable.learning_route&.learning_profile&.user
      when CommunityEngine::SharedRoute
        commentable.user
      when CommunityEngine::Comment, CommunityEngine::Post
        commentable.user
      end
    end
  end
end
