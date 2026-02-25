module CommunityEngine
  class FollowsController < ApplicationController
    def create
      @followed_user = Core::User.find_by(id: params[:followed_id])
      return head(:not_found) unless @followed_user
      return head(:unprocessable_entity) if @followed_user == current_user

      follow = Follow.find_or_initialize_by(follower: current_user, followed: @followed_user)
      if follow.new_record? && follow.save
        ActivityTracker.track!(user: current_user, action: "followed", trackable: @followed_user)
        NotificationService.notify!(
          user: @followed_user,
          actor: current_user,
          notifiable: follow,
          notification_type: "new_follower"
        )
      end

      respond_to do |format|
        format.turbo_stream {
          render turbo_stream: turbo_stream.replace(
            "follow_button_#{@followed_user.id}",
            partial: "community_engine/follows/button",
            locals: { user: @followed_user, following: true }
          )
        }
        format.html { redirect_back(fallback_location: root_path) }
      end
    end

    def destroy
      follow = current_user.active_follows.find_by(followed_id: params[:id])
      return head(:not_found) unless follow

      @followed_user = follow.followed
      follow.destroy

      respond_to do |format|
        format.turbo_stream {
          render turbo_stream: turbo_stream.replace(
            "follow_button_#{@followed_user.id}",
            partial: "community_engine/follows/button",
            locals: { user: @followed_user, following: false }
          )
        }
        format.html { redirect_back(fallback_location: root_path) }
      end
    end
  end
end
