module CommunityEngine
  class NotificationsController < ApplicationController
    def index
      @notifications = current_user.notifications.recent.includes(:actor, :notifiable).limit(50)
    end

    def mark_read
      notification = current_user.notifications.find(params[:id])
      notification.mark_as_read!
      head :ok
    end

    def mark_all_read
      current_user.notifications.unread.update_all(read_at: Time.current)
      respond_to do |format|
        format.turbo_stream {
          render turbo_stream: turbo_stream.update("notification_badge", html: "")
        }
        format.html { redirect_back(fallback_location: root_path) }
      end
    end

    def unread_count
      count = current_user.notifications.unread.count
      render json: { count: count }
    end
  end
end
