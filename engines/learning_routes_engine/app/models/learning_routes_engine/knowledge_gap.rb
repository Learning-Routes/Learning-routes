module LearningRoutesEngine
  class KnowledgeGap < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :learning_route

    has_many :reinforcement_routes, dependent: :destroy

    enum :severity, { low: 0, medium: 1, high: 2 }

    validates :topic, presence: true
    validates :severity, presence: true

    scope :unresolved, -> { where(resolved: false) }
    scope :by_severity, ->(severity) { where(severity: severity) }

    def resolve!
      update!(resolved: true)
    end
  end
end
