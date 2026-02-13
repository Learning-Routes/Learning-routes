module Core
  class Session < ApplicationRecord
    belongs_to :user

    validates :user, presence: true

    scope :active, -> { where("last_active_at > ?", 30.days.ago) }
    scope :expired, -> { where("last_active_at <= ?", 30.days.ago) }

    def touch_last_active!
      update_column(:last_active_at, Time.current)
    end

    def expired?
      last_active_at.nil? || last_active_at <= 30.days.ago
    end
  end
end
