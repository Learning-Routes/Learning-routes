module CommunityEngine
  class Comment < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :commentable, polymorphic: true
    belongs_to :parent, class_name: "CommunityEngine::Comment", optional: true, counter_cache: :replies_count

    has_many :replies, class_name: "CommunityEngine::Comment", foreign_key: :parent_id, dependent: :destroy
    has_many :likes, as: :likeable, class_name: "CommunityEngine::Like", dependent: :destroy

    validates :body, presence: true, length: { minimum: 1, maximum: 5000 }

    scope :top_level, -> { where(parent_id: nil) }
    scope :recent, -> { order(created_at: :desc) }
    scope :popular, -> { order(likes_count: :desc, created_at: :desc) }

    after_create :increment_commentable_counter
    after_destroy :decrement_commentable_counter

    def edited?
      edited_at.present?
    end

    def owned_by?(check_user)
      user_id == check_user&.id
    end

    def top_level?
      parent_id.nil?
    end

    def liked_by?(user)
      return false unless user
      likes.exists?(user_id: user.id)
    end

    private

    def increment_commentable_counter
      return unless commentable.respond_to?(:comments_count)
      commentable.class.where(id: commentable_id).update_all("comments_count = comments_count + 1")
    end

    def decrement_commentable_counter
      return unless commentable.respond_to?(:comments_count)
      commentable.class.where(id: commentable_id).update_all("comments_count = GREATEST(comments_count - 1, 0)")
    end
  end
end
