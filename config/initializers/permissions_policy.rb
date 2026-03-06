# Be sure to restart your server when you modify this file.

# Define Permissions-Policy header to restrict browser features.
# https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy

Rails.application.config.permissions_policy do |policy|
  policy.camera      :none
  policy.gyroscope   :none
  policy.magnetometer :none
  policy.usb         :none
  policy.fullscreen  :self
  policy.microphone  :self  # Voice recorder feature
end
