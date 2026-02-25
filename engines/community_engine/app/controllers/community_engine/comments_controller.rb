module CommunityEngine
  class CommentsController < ApplicationController
    before_action :set_comment, only: [:update, :destroy]

    def create
      @comment = Comment.new(comment_params)
      @comment.user = current_user

      if @comment.save
        # Track activity
        ActivityTracker.track!(
          user: current_user,
          action: "commented",
          trackable: @comment.commentable,
          metadata: { comment_id: @comment.id, preview: @comment.body.truncate(100) }
        )

        # Notify the owner of the commentable
        owner = find_commentable_owner(@comment)
        if owner
          NotificationService.notify!(
            user: owner,
            actor: current_user,
            notifiable: @comment,
            notification_type: @comment.parent_id? ? "comment_reply" : "new_comment",
            metadata: { preview: @comment.body.truncate(100) }
          )
        end

        # If it's a reply, also notify the parent comment owner
        if @comment.parent.present? && @comment.parent.user_id != owner&.id
          NotificationService.notify!(
            user: @comment.parent.user,
            actor: current_user,
            notifiable: @comment,
            notification_type: "comment_reply"
          )
        end

        respond_to do |format|
          format.turbo_stream
          format.html { redirect_back(fallback_location: root_path) }
        end
      else
        respond_to do |format|
          format.turbo_stream { render turbo_stream: turbo_stream.replace("comment_form_errors", partial: "community_engine/comments/errors", locals: { comment: @comment }) }
          format.html { redirect_back(fallback_location: root_path, alert: @comment.errors.full_messages.join(", ")) }
        end
      end
    end

    def update
      return head(:forbidden) unless @comment.owned_by?(current_user)

      if @comment.update(body: params[:comment][:body], edited_at: Time.current)
        respond_to do |format|
          format.turbo_stream
          format.html { redirect_back(fallback_location: root_path) }
        end
      else
        head :unprocessable_entity
      end
    end

    def destroy
      return head(:forbidden) unless @comment.owned_by?(current_user) || current_user.role == "admin"

      @comment.destroy
      respond_to do |format|
        format.turbo_stream { render turbo_stream: turbo_stream.remove("comment_#{@comment.id}") }
        format.html { redirect_back(fallback_location: root_path) }
      end
    end

    private

    def set_comment
      @comment = Comment.find(params[:id])
    end

    def comment_params
      params.require(:comment).permit(:body, :commentable_type, :commentable_id, :parent_id)
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
      when CommunityEngine::Comment
        commentable.user
      end
    end
  end
end
