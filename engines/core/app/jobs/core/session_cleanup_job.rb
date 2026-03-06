module Core
  class SessionCleanupJob < ApplicationJob
    queue_as :low

    def perform
      count = Core::Session.where("last_active_at < ?", 30.days.ago).delete_all
      Rails.logger.info("[SessionCleanupJob] Cleaned up #{count} expired sessions")
    end
  end
end
