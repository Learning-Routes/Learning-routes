module LearningRoutesEngine
  class RouteStep < ApplicationRecord
    belongs_to :learning_route

    enum :level, { nv1: 0, nv2: 1, nv3: 2 }, prefix: true
    enum :content_type, { lesson: 0, exercise: 1, assessment: 2, review: 3 }, prefix: true
    enum :status, { locked: 0, available: 1, in_progress: 2, completed: 3 }

    validates :position, presence: true,
              uniqueness: { scope: :learning_route_id },
              numericality: { greater_than_or_equal_to: 0 }
    validates :title, presence: true, length: { maximum: 255 }

    scope :by_level, ->(level) { where(level: level) }
    scope :available_steps, -> { where(status: :available) }
    scope :completed_steps, -> { where(status: :completed) }

    def complete!
      update!(status: :completed, completed_at: Time.current)
    end

    def unlock!
      update!(status: :available) if locked?
    end
  end
end
