module CommunityEngine
  class Like < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :likeable, polymorphic: true

    validates :user_id, uniqueness: { scope: [:likeable_type, :likeable_id], message: "already liked" }

    after_create :increment_counter
    after_destroy :decrement_counter

    private

    def increment_counter
      return unless likeable.respond_to?(:likes_count)
      likeable.class.where(id: likeable_id).update_all("likes_count = likes_count + 1")
    end

    def decrement_counter
      return unless likeable.respond_to?(:likes_count)
      likeable.class.where(id: likeable_id).update_all("likes_count = GREATEST(likes_count - 1, 0)")
    end
  end
end
