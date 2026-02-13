module LearningRoutesEngine
  class LearningProfile < ApplicationRecord
    belongs_to :user, class_name: "Core::User"

    has_many :learning_routes, dependent: :destroy

    validates :current_level, presence: true,
              inclusion: { in: %w[beginner intermediate advanced] }

    scope :by_level, ->(level) { where(current_level: level) }
  end
end
