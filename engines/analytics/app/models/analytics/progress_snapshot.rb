module Analytics
  class ProgressSnapshot < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :learning_route, class_name: "LearningRoutesEngine::LearningRoute"

    validates :snapshot_date, presence: true
    validates :completion_percentage, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }
    validates :snapshot_date, uniqueness: { scope: [:user_id, :learning_route_id] }

    scope :for_user, ->(user) { where(user: user) }
    scope :for_route, ->(route) { where(learning_route: route) }
    scope :recent, -> { order(snapshot_date: :desc) }
    scope :in_period, ->(range) { where(snapshot_date: range) }

    def self.take_snapshot!(user:, learning_route:)
      create_or_find_by!(
        user: user,
        learning_route: learning_route,
        snapshot_date: Date.current
      ) do |snapshot|
        snapshot.completion_percentage = learning_route.progress_percentage
        snapshot.steps_completed = learning_route.current_step
        snapshot.total_steps = learning_route.total_steps
      end
    end
  end
end
