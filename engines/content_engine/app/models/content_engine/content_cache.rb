module ContentEngine
  class ContentCache < ApplicationRecord
    validates :cache_key, presence: true, uniqueness: true
    validates :content, presence: true

    scope :active, -> { where("expires_at IS NULL OR expires_at > ?", Time.current) }
    scope :expired, -> { where("expires_at <= ?", Time.current) }

    def expired?
      expires_at.present? && expires_at <= Time.current
    end

    def self.fetch(key, expires_in: 24.hours, &block)
      record = active.find_by(cache_key: key)
      return record.content if record

      content = block.call
      create!(cache_key: key, content: content, expires_at: Time.current + expires_in)
      content
    end

    def self.purge_expired!
      expired.delete_all
    end
  end
end
