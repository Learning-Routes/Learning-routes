module Analytics
  class StudySession < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :learning_route, class_name: "LearningRoutesEngine::LearningRoute", optional: true
    belongs_to :route_step, class_name: "LearningRoutesEngine::RouteStep", optional: true

    validates :started_at, presence: true

    scope :for_user, ->(user) { where(user: user) }
    scope :active, -> { where(ended_at: nil) }
    scope :completed, -> { where.not(ended_at: nil) }
    scope :today, -> { where("started_at >= ?", Time.current.beginning_of_day) }
    scope :this_week, -> { where("started_at >= ?", Time.current.beginning_of_week) }

    def active?
      ended_at.nil?
    end

    def finish!
      update!(
        ended_at: Time.current,
        duration_minutes: ((Time.current - started_at) / 60).round
      )
    end

    def self.total_minutes_for(user:, period: Date.current.all_week)
      for_user(user).where(started_at: period).sum(:duration_minutes)
    end
  end
end
