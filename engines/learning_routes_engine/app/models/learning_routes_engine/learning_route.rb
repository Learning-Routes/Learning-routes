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
      if association(:route_steps).loaded?
        steps = route_steps.to_a
        total = steps.size
        return 0 if total.zero?
        completed = steps.count(&:completed?)
        ((completed.to_f / total) * 100).round(1)
      else
        counts = route_steps.reorder(nil).group(:status).count
        total = counts.values.sum
        return 0 if total.zero?
        completed = counts["completed"] || counts[:completed] || counts[3] || 0
        ((completed.to_f / total) * 100).round(1)
      end
    end

    def current_route_step
      if association(:route_steps).loaded?
        route_steps.to_a.find { |s| s.position == current_step }
      else
        route_steps.find_by(position: current_step)
      end
    end

    def completed_steps_count
      if association(:route_steps).loaded?
        route_steps.count(&:completed?)
      else
        route_steps.completed_steps.count
      end
    end

    def nv1_steps
      filter_loaded_or_scope(:nv1)
    end

    def nv2_steps
      filter_loaded_or_scope(:nv2)
    end

    def nv3_steps
      filter_loaded_or_scope(:nv3)
    end

    def estimated_total_minutes
      if association(:route_steps).loaded?
        route_steps.sum { |s| s.estimated_minutes.to_i }
      else
        route_steps.sum(:estimated_minutes)
      end
    end

    def estimated_remaining_minutes
      if association(:route_steps).loaded?
        route_steps.reject(&:completed?).sum { |s| s.estimated_minutes.to_i }
      else
        route_steps.where.not(status: :completed).sum(:estimated_minutes)
      end
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
      return false unless user
      if instance_variable_defined?(:@_liked_by_cached_user_id) &&
         @_liked_by_cached_user_id == user.id
        return @_liked_by_cached
      end
      likes.exists?(user_id: user.id)
    end

    def shared?
      shared_route.present?
    end

    private

    def filter_loaded_or_scope(level)
      if association(:route_steps).loaded?
        route_steps.select { |s| s.level == level.to_s }
      else
        route_steps.by_level(level)
      end
    end

    def target_locale_differs_from_locale
      return if target_locale.blank?
      if target_locale == locale
        errors.add(:target_locale, :same_as_locale)
      end
    end
  end
end
