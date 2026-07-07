# frozen_string_literal: true

Rails.application.config.middleware.use OmniAuth::Builder do
  # Credentials are the source of truth; ENV is the transitional fallback.
  google_client_id = Rails.application.credentials.dig(:google, :client_id).presence || ENV["GOOGLE_CLIENT_ID"]
  google_client_secret = Rails.application.credentials.dig(:google, :client_secret).presence || ENV["GOOGLE_CLIENT_SECRET"]

  if google_client_id.present? && google_client_secret.present?
    provider :google_oauth2, google_client_id, google_client_secret,
      scope: "email,profile",
      prompt: "select_account",
      image_aspect_ratio: "square",
      image_size: 96
  end
end

OmniAuth.config.allowed_request_methods = [:post]

OmniAuth.config.on_failure = Proc.new do |env|
  OmniAuth::FailureEndpoint.new(env).redirect_to_failure
end
