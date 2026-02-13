module Analytics
  class LearningMetric < ApplicationRecord
    belongs_to :user, class_name: "Core::User"

    validates :metric_type, presence: true
    validates :recorded_date, presence: true
    validates :value, numericality: true, allow_nil: true

    METRIC_TYPES = %w[
      completion_rate
      average_score
      study_time_minutes
      streak_days
      retention_rate
      knowledge_gap_count
      routes_completed
    ].freeze

    validates :metric_type, inclusion: { in: METRIC_TYPES }

    scope :for_user, ->(user) { where(user: user) }
    scope :by_type, ->(type) { where(metric_type: type) }
    scope :in_period, ->(range) { where(recorded_date: range) }
    scope :recent, -> { order(recorded_date: :desc) }

    def self.record!(user:, metric_type:, value:, subject: nil, metadata: {})
      create!(
        user: user,
        metric_type: metric_type,
        value: value,
        subject: subject,
        metadata: metadata,
        recorded_date: Date.current
      )
    end
  end
end
