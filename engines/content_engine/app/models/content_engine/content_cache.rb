module ContentEngine
  class ContentCache < ApplicationRecord
    # The "cache_key" column collides with ActiveRecord::Base#cache_key, which
    # makes AR raise DangerousAttributeError when it generates attribute methods
    # (i.e. the model can't be instantiated at all). Allow it — the column is a
    # deliberate lookup key; instance access shadows the base method safely.
    # Same pattern as AiOrchestrator::AiInteraction.
    def self.dangerous_attribute_method?(method_name)
      return false if method_name == "cache_key"
      super
    end

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
      record = create!(cache_key: key, content: content, expires_at: Time.current + expires_in)
      record.content
    rescue ActiveRecord::RecordNotUnique
      active.find_by!(cache_key: key).content
    end

    def self.purge_expired!
      expired.delete_all
    end
  end
end
