module LearningRoutesEngine
  class LearningRoute < ApplicationRecord
    belongs_to :learning_profile

    has_many :route_steps, -> { order(:position) }, dependent: :destroy
    has_many :knowledge_gaps, dependent: :destroy
    has_many :reinforcement_routes, dependent: :destroy
    has_many :route_requests, class_name: "::RouteRequest", dependent: :nullify
    has_many :progress_snapshots, class_name: "Analytics::ProgressSnapshot", dependent: :destroy
    has_many :study_sessions, class_name: "Analytics::StudySession", dependent: :nullify

    # Community associations
    has_many :comments, as: :commentable, class_name: "CommunityEngine::Comment", dependent: :destroy
    has_many :likes, as: :likeable, class_name: "CommunityEngine::Like", dependent: :destroy
    has_one :shared_route, class_name: "CommunityEngine::SharedRoute", dependent: :destroy

    enum :status, { draft: 0, active: 1, completed: 2, paused: 3 }

    GENERATION_STATUSES = %w[pending generating completed failed].freeze

    validates :topic, presence: true, length: { maximum: 255 }
    validates :status, presence: true
    validates :generation_status, inclusion: { in: GENERATION_STATUSES }, allow_nil: true
    validates :current_step, numericality: { greater_than_or_equal_to: 0 }
    validates :total_steps, numericality: { greater_than_or_equal_to: 0 }
    validates :target_locale, inclusion: { in: ->(_) { I18n.available_locales.map(&:to_s) } }, allow_nil: true
    validate :target_locale_differs_from_locale

    scope :active_routes, -> { where(status: :active) }
    scope :by_topic, ->(topic) { where("topic ILIKE ?", "%#{topic}%") }
    scope :generating, -> { where(generation_status: "generating") }
    scope :generated, -> { where(generation_status: "completed") }
    scope :generation_failed, -> { where(generation_status: "failed") }

    def progress_percentage
      total = route_steps.count
      return 0 if total.zero?
      completed = route_steps.completed_steps.count
      ((completed.to_f / total) * 100).round(1)
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

    def language_route?
      target_locale.present?
    end

    def bilingual_content?
      target_locale.present?
    end

    def liked_by?(user)
      likes.exists?(user_id: user.id)
    end

    def shared?
      shared_route.present?
    end

    private

    def target_locale_differs_from_locale
      return if target_locale.blank?
      if target_locale == locale
        errors.add(:target_locale, :same_as_locale)
      end
    end
  end
end
