class XpTransaction < ApplicationRecord
  belongs_to :user, class_name: "Core::User"

  VALID_SOURCES = %w[
    lesson_complete lesson_perfect quiz_complete quiz_perfect
    step_complete route_complete streak_bonus_7 streak_bonus_30
    streak_bonus_100 daily_first_lesson speed_bonus achievement
  ].freeze

  validates :amount, numericality: { other_than: 0 }
  validates :source_type, presence: true, inclusion: { in: VALID_SOURCES }

  scope :recent, -> { order(created_at: :desc) }
  scope :today, -> { where(created_at: Date.current.all_day) }
  scope :this_week, -> { where(created_at: Date.current.beginning_of_week..) }
end
