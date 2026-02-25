module CommunityEngine
  class NotificationService
    def self.notify!(user:, actor:, notifiable:, notification_type:, metadata: {})
      # Don't notify yourself
      return if user.id == actor.id

      notification = Notification.create!(
        user: user,
        actor: actor,
        notifiable: notifiable,
        notification_type: notification_type,
        metadata: metadata
      )

      # Broadcast real-time update to the user's notification channel
      broadcast_notification_count(user)

      notification
    end

    def self.broadcast_notification_count(user)
      count = user.notifications.unread.count

      Turbo::StreamsChannel.broadcast_update_to(
        "notifications_#{user.id}",
        target: "notification_badge",
        html: count > 0 ? "<span class=\"notification-badge\">#{count > 99 ? '99+' : count}</span>" : ""
      )
    end
  end
end
