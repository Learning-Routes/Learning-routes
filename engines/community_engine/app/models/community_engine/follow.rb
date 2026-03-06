module CommunityEngine
  class Follow < ApplicationRecord
    belongs_to :follower, class_name: "Core::User"
    belongs_to :followed, class_name: "Core::User"

    validates :follower_id, uniqueness: { scope: :followed_id, message: "already following" }
    validate :cannot_follow_self

    after_create :increment_counters
    after_destroy :decrement_counters

    private

    def cannot_follow_self
      errors.add(:follower_id, "cannot follow yourself") if follower_id == followed_id
    end

    def increment_counters
      Core::User.where(id: follower_id).update_all("following_count = following_count + 1")
      Core::User.where(id: followed_id).update_all("followers_count = followers_count + 1")
    end

    def decrement_counters
      Core::User.where(id: follower_id).update_all("following_count = GREATEST(following_count - 1, 0)")
      Core::User.where(id: followed_id).update_all("followers_count = GREATEST(followers_count - 1, 0)")
    end
  end
end
