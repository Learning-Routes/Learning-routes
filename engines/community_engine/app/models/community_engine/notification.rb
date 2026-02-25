module CommunityEngine
  class Notification < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :actor, class_name: "Core::User"
    belongs_to :notifiable, polymorphic: true

    TYPES = %w[new_comment new_like new_follower comment_reply route_shared].freeze

    validates :notification_type, presence: true, inclusion: { in: TYPES }

    scope :unread, -> { where(read_at: nil) }
    scope :read, -> { where.not(read_at: nil) }
    scope :recent, -> { order(created_at: :desc) }
    scope :for_user, ->(user_id) { where(user_id: user_id) }

    def read?
      read_at.present?
    end

    def unread?
      !read?
    end

    def mark_as_read!
      update!(read_at: Time.current) unless read?
    end

    def notification_text
      I18n.t("community_engine.notifications.#{notification_type}", default: notification_type)
    end
  end
end
