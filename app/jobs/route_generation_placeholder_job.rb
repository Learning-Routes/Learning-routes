class RouteGenerationPlaceholderJob < ApplicationJob
  queue_as :default

  def perform(user_id)
    # Placeholder: will be replaced by actual AI route generation in Phase 4
    Rails.logger.info "[RouteGeneration] Placeholder job triggered for user #{user_id}"
  end
end
