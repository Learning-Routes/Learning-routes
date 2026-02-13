module LearningRoutesEngine
  class LearningRoute < ApplicationRecord
    belongs_to :learning_profile

    has_many :route_steps, -> { order(:position) }, dependent: :destroy
    has_many :knowledge_gaps, dependent: :destroy
    has_many :reinforcement_routes, dependent: :destroy

    enum :status, { draft: 0, active: 1, completed: 2, paused: 3 }

    validates :topic, presence: true, length: { maximum: 255 }
    validates :status, presence: true
    validates :current_step, numericality: { greater_than_or_equal_to: 0 }
    validates :total_steps, numericality: { greater_than_or_equal_to: 0 }

    scope :active_routes, -> { where(status: :active) }
    scope :by_topic, ->(topic) { where("topic ILIKE ?", "%#{topic}%") }

    def progress_percentage
      return 0 if total_steps.zero?
      ((current_step.to_f / total_steps) * 100).round(1)
    end

    def current_route_step
      route_steps.find_by(position: current_step)
    end
  end
end
