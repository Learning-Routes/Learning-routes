module CommunityEngine
  class SharedRoute < ApplicationRecord
    belongs_to :learning_route, class_name: "LearningRoutesEngine::LearningRoute"
    belongs_to :user, class_name: "Core::User"
    belongs_to :cloned_from, class_name: "CommunityEngine::SharedRoute", optional: true

    has_many :comments, as: :commentable, class_name: "CommunityEngine::Comment", dependent: :destroy
    has_many :likes, as: :likeable, class_name: "CommunityEngine::Like", dependent: :destroy
    has_many :clones, class_name: "CommunityEngine::SharedRoute", foreign_key: :cloned_from_id
    has_many :ratings, class_name: "CommunityEngine::Rating", dependent: :destroy

    VISIBILITIES = %w[public unlisted private].freeze

    validates :visibility, presence: true, inclusion: { in: VISIBILITIES }
    validates :share_token, presence: true, uniqueness: true

    before_validation :generate_share_token, on: :create

    scope :publicly_visible, -> { where(visibility: "public") }
    scope :recent, -> { order(created_at: :desc) }
    scope :popular, -> { order(likes_count: :desc) }
    scope :trending_today, -> {
      publicly_visible
        .where("created_at >= ? OR updated_at >= ?", 7.days.ago, 1.day.ago)
        .order(likes_count: :desc, comments_count: :desc)
    }

    def to_param
      share_token
    end

    def public?
      visibility == "public"
    end

    def liked_by?(user)
      return false unless user
      likes.exists?(user_id: user.id)
    end

    def average_rating
      return 0.0 if ratings_count.zero?
      (ratings_sum.to_f / ratings_count).round(1)
    end

    def rated_by?(user)
      return false unless user
      ratings.exists?(user_id: user.id)
    end

    def user_rating(user)
      return nil unless user
      ratings.find_by(user_id: user.id)&.score
    end

    def best_comment
      comments.top_level.popular.includes(:user).first
    end

    def share_url
      "/community_engine/shared_routes/#{share_token}"
    end

    private

    def generate_share_token
      self.share_token ||= SecureRandom.urlsafe_base64(12)
    end
  end
end
