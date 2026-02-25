module CommunityEngine
  class Activity < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :trackable, polymorphic: true

    ACTIONS = %w[commented liked followed shared completed_step completed_route cloned_route].freeze

    validates :action, presence: true, inclusion: { in: ACTIONS }

    scope :recent, -> { order(created_at: :desc) }
    scope :by_action, ->(action) { where(action: action) }
    scope :today, -> { where("created_at >= ?", Time.current.beginning_of_day) }
    scope :this_week, -> { where("created_at >= ?", 1.week.ago) }

    # Feed for a specific user (their own activities)
    scope :for_user, ->(user_id) { where(user_id: user_id) }

    # Feed of activities from followed users
    scope :from_followed_users, ->(user) {
      followed_ids = CommunityEngine::Follow.where(follower_id: user.id).select(:followed_id)
      where(user_id: followed_ids)
    }

    def action_text
      I18n.t("community_engine.activities.#{action}", default: action)
    end
  end
end
