module CommunityEngine
  class ActivityTracker
    def self.track!(user:, action:, trackable:, metadata: {})
      return if user.blank? || trackable.blank?

      # Prevent duplicate activities within 1 minute
      recent = Activity.where(
        user_id: user.id,
        action: action,
        trackable_type: trackable.class.name,
        trackable_id: trackable.id
      ).where("created_at > ?", 1.minute.ago)

      return if recent.exists?

      Activity.create!(
        user: user,
        action: action,
        trackable: trackable,
        metadata: metadata
      )
    end
  end
end
