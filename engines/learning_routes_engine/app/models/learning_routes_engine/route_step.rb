module LearningRoutesEngine
  class RouteStep < ApplicationRecord
    belongs_to :learning_route

    has_one :step_quiz, -> { where(assessment_type: :step_quiz) },
            class_name: "Assessments::Assessment",
            foreign_key: :route_step_id

    has_many :ai_contents,
             class_name: "ContentEngine::AiContent",
             foreign_key: :route_step_id,
             dependent: :destroy

    has_many :voice_responses,
             class_name: "Assessments::VoiceResponse",
             foreign_key: :route_step_id,
             dependent: :destroy

    # Community associations
    has_many :comments, as: :commentable, class_name: "CommunityEngine::Comment", dependent: :destroy
    has_many :likes, as: :likeable, class_name: "CommunityEngine::Like", dependent: :destroy

    enum :level, { nv1: 0, nv2: 1, nv3: 2 }, prefix: true
    enum :content_type, { lesson: 0, exercise: 1, assessment: 2, review: 3 }, prefix: true
    enum :status, { locked: 0, available: 1, in_progress: 2, completed: 3 }
    enum :fsrs_state, { fsrs_new: 0, fsrs_learning: 1, fsrs_review: 2, fsrs_relearning: 3 }, prefix: true

    validates :position, presence: true,
              uniqueness: { scope: :learning_route_id },
              numericality: { greater_than_or_equal_to: 0 }
    validates :title, presence: true, length: { maximum: 255 }

    scope :by_level, ->(level) { where(level: level) }
    scope :available_steps, -> { where(status: :available) }
    scope :completed_steps, -> { where(status: :completed) }
    scope :due_for_review, -> { where(status: :completed).where("fsrs_next_review_at <= ?", Time.current) }
    scope :reviews_only, -> { where(content_type: :review) }

    def complete!
      update!(status: :completed, completed_at: Time.current)
    end

    def unlock!
      update!(status: :available) if locked?
    end

    def prerequisites_met?
      return true if prerequisites.blank?

      prerequisite_steps = learning_route.route_steps.where(id: prerequisites)
      prerequisite_steps.all? { |step| step.completed? }
    end

    def unlock_if_ready!
      unlock! if locked? && prerequisites_met?
    end

    def localized_title(locale = I18n.locale)
      translations.dig(locale.to_s, "title") || title
    end

    def localized_description(locale = I18n.locale)
      translations.dig(locale.to_s, "description") || description
    end

    def requires_quiz?
      content_type_lesson? || content_type_exercise?
    end

    def quiz_passed_by?(user)
      step_quiz&.passed_by?(user) || false
    end

    def audio_delivery?
      delivery_format == "audio"
    end

    def audio_content
      ai_contents.order(created_at: :desc).first
    end

    def audio_ready?
      audio_content&.audio_ready? || false
    end

    def liked_by?(user)
      likes.exists?(user_id: user.id)
    end
  end
end
