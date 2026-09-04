module Analytics
  class ProgressSnapshot < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :learning_route, class_name: "LearningRoutesEngine::LearningRoute"

    validates :snapshot_date, presence: true
    validates :completion_percentage, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }

    # NO model-level uniqueness on snapshot_date. `idx_progress_snapshots_unique`
    # on (user_id, learning_route_id, snapshot_date) is the guard, and it is the
    # only one that can be: a model validation cannot stop two concurrent
    # INSERTs, it can only lose the race politely.
    #
    # It also actively BROKE the caller. `take_snapshot!` uses
    # `create_or_find_by!`, which is defined as "attempt create!, rescue
    # ActiveRecord::RecordNotUnique" — the DATABASE's error. A validation runs
    # BEFORE the INSERT, so create! raised `RecordInvalid`, which
    # `create_or_find_by!` does not rescue, and the request 422'd. The second
    # submit of the day on a route failed for every student, every time.
    #
    # If a friendly form-level message is ever wanted here, `take_snapshot!` must
    # stop using `create_or_find_by!` and handle the collision itself. Do not
    # reintroduce both.

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
