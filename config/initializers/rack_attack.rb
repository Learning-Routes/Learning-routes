# frozen_string_literal: true

# Rack::Attack — block automated scanners and rate-limit sensitive auth
# endpoints. Uses Rails.cache (Solid Cache in production) as the counter store.
#
# Route paths are verified against config/routes.rb: the Core engine is mounted
# at "/", so the auth endpoints live at the application root.
class Rack::Attack
  ### Blocklist: obvious scanner / secret-probe paths ###
  # Bots continuously probe for leaked secrets and admin panels (.env, .git,
  # wp-admin, …). Any request whose path starts with one of these is dropped
  # with 403 before it touches the app. Anchored to the start of the path so we
  # never match a legitimate route that merely contains the substring.
  SCANNER_PATH = %r{\A/(?:\.env|\.aws|\.git|\.ssh|\.DS_Store|wp-admin|wp-login|xmlrpc\.php|phpmyadmin|phpMyAdmin|administrator|vendor/phpunit)}i

  blocklist("block-scanners") do |req|
    SCANNER_PATH.match?(req.path)
  end

  ### Throttles: auth endpoints, per IP ###
  # Login attempts — 5 per minute per IP.
  throttle("logins/ip", limit: 5, period: 60) do |req|
    req.ip if req.post? && req.path == "/sign_in"
  end

  # Password-reset requests — 3 per hour per IP.
  throttle("password_resets/ip", limit: 3, period: 1.hour) do |req|
    req.ip if req.post? && req.path == "/forgot_password"
  end

  # Sign-ups — 5 per hour per IP (blunts mass account creation / email abuse).
  throttle("signups/ip", limit: 5, period: 1.hour) do |req|
    req.ip if req.post? && req.path == "/sign_up"
  end

  ### Safelist: never interfere with the health check ###
  safelist("allow-health-check") do |req|
    req.path == "/up"
  end

  ### Responses ###
  # Throttled requests get 429 with a Retry-After hint; blocked ones get 403.
  self.throttled_responder = lambda do |req|
    match_data = req.env["rack.attack.match_data"] || {}
    retry_after = match_data[:period] || 60
    [
      429,
      { "Content-Type" => "text/plain", "Retry-After" => retry_after.to_s },
      ["Too many requests. Please retry later.\n"]
    ]
  end
end

# Log blocked/throttled requests so abuse is visible in production logs.
ActiveSupport::Notifications.subscribe("throttle.rack_attack") do |_name, _start, _finish, _id, payload|
  req = payload[:request]
  Rails.logger.warn("[Rack::Attack] throttled #{req.env['rack.attack.matched']} ip=#{req.ip} path=#{req.path}")
end

ActiveSupport::Notifications.subscribe("blocklist.rack_attack") do |_name, _start, _finish, _id, payload|
  req = payload[:request]
  Rails.logger.warn("[Rack::Attack] blocked #{req.env['rack.attack.matched']} ip=#{req.ip} path=#{req.path}")
end
