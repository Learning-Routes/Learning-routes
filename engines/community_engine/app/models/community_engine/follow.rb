module CommunityEngine
  class Follow < ApplicationRecord
    belongs_to :follower, class_name: "Core::User"
    belongs_to :followed, class_name: "Core::User"

    validates :follower_id, uniqueness: { scope: :followed_id, message: "already following" }
    validate :cannot_follow_self

    private

    def cannot_follow_self
      errors.add(:follower_id, "cannot follow yourself") if follower_id == followed_id
    end
  end
end
