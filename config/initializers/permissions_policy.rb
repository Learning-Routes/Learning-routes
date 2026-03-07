# Be sure to restart your server when you modify this file.

# Define browser feature restrictions (generates Feature-Policy header).
# Permissions-Policy (modern standard) is set in config/application.rb default_headers.
# https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy

Rails.application.config.permissions_policy do |policy|
  policy.camera      :none
  policy.gyroscope   :none
  policy.magnetometer :none
  policy.usb         :none
  policy.fullscreen  :self
  policy.microphone  :self  # Voice recorder feature
end
