# frozen_string_literal: true

Rails.application.config.middleware.use OmniAuth::Builder do
  google_client_id = ENV["GOOGLE_CLIENT_ID"] || Rails.application.credentials.dig(:google, :client_id)
  google_client_secret = ENV["GOOGLE_CLIENT_SECRET"] || Rails.application.credentials.dig(:google, :client_secret)

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
