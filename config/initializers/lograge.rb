# Be sure to restart your server when you modify this file.

# Configure Lograge for structured logging in production.
# This replaces the default verbose Rails logging with single-line JSON log entries.

Rails.application.configure do
  config.lograge.enabled = Rails.env.production?

  config.lograge.base_controller_class = "ActionController::Base"

  # Use JSON format for log entries
  config.lograge.formatter = Lograge::Formatters::Json.new

  # Include additional data in log entries
  config.lograge.custom_options = lambda do |event|
    {
      time: Time.current.iso8601,
      host: event.payload[:host],
      remote_ip: event.payload[:remote_ip],
      user_id: event.payload[:user_id],
      request_id: event.payload[:headers]&.fetch("action_dispatch.request_id", nil)
    }.compact
  end

  # Append user info to log payload
  config.lograge.custom_payload do |controller|
    {
      host: controller.request.host,
      remote_ip: controller.request.remote_ip,
      user_id: controller.respond_to?(:current_user, true) ? controller.send(:current_user)&.id : nil
    }
  end
end
