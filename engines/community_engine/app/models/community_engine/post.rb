module CommunityEngine
  class Post < ApplicationRecord
    belongs_to :user, class_name: "Core::User"

    has_many :comments, as: :commentable, class_name: "CommunityEngine::Comment", dependent: :destroy
    has_many :likes, as: :likeable, class_name: "CommunityEngine::Like", dependent: :destroy

    validates :body, presence: true, length: { minimum: 1, maximum: 2000 }

    scope :recent, -> { order(created_at: :desc) }

    def liked_by?(user)
      return false unless user
      likes.exists?(user_id: user.id)
    end

    def owned_by?(user)
      return false unless user
      user_id == user.id
    end
  end
end
