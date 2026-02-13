module LearningRoutesEngine
  class ReinforcementRoute < ApplicationRecord
    belongs_to :learning_route
    belongs_to :knowledge_gap

    enum :status, { pending: 0, active: 1, completed: 2 }

    validates :status, presence: true

    scope :active_routes, -> { where(status: :active) }
    scope :pending_routes, -> { where(status: :pending) }
  end
end
