module LearningRoutesEngine
  class LearningRoute < ApplicationRecord
    belongs_to :learning_profile

    has_many :route_steps, -> { order(:position) }, dependent: :destroy
    has_many :knowledge_gaps, dependent: :destroy
    has_many :reinforcement_routes, dependent: :destroy

    # Community associations
    has_many :comments, as: :commentable, class_name: "CommunityEngine::Comment", dependent: :destroy
    has_many :likes, as: :likeable, class_name: "CommunityEngine::Like", dependent: :destroy
    has_one :shared_route, class_name: "CommunityEngine::SharedRoute", dependent: :destroy

    enum :status, { draft: 0, active: 1, completed: 2, paused: 3 }

    validates :topic, presence: true, length: { maximum: 255 }
    validates :status, presence: true
    validates :current_step, numericality: { greater_than_or_equal_to: 0 }
    validates :total_steps, numericality: { greater_than_or_equal_to: 0 }

    scope :active_routes, -> { where(status: :active) }
    scope :by_topic, ->(topic) { where("topic ILIKE ?", "%#{topic}%") }
    scope :generating, -> { where(generation_status: "generating") }
    scope :generated, -> { where(generation_status: "completed") }
    scope :generation_failed, -> { where(generation_status: "failed") }

    def progress_percentage
      return 0 if total_steps.zero?
      ((current_step.to_f / total_steps) * 100).round(1)
    end

    def current_route_step
      route_steps.find_by(position: current_step)
    end

    def nv1_steps
      route_steps.by_level(:nv1)
    end

    def nv2_steps
      route_steps.by_level(:nv2)
    end

    def nv3_steps
      route_steps.by_level(:nv3)
    end

    def estimated_total_minutes
      route_steps.sum(:estimated_minutes)
    end

    def estimated_remaining_minutes
      route_steps.where.not(status: :completed).sum(:estimated_minutes)
    end

    def localized_topic(locale = I18n.locale)
      translations.dig(locale.to_s, "title") || topic
    end

    def localized_subject_area(locale = I18n.locale)
      translations.dig(locale.to_s, "subject_area") || subject_area
    end

    def liked_by?(user)
      likes.exists?(user_id: user.id)
    end

    def shared?
      shared_route.present?
    end
  end
end
