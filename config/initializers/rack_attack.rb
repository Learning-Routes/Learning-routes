# frozen_string_literal: true

# Rack::Attack — block automated scanners and rate-limit sensitive auth
# endpoints. Uses Rails.cache (Solid Cache in production) as the counter store.
#
# Route paths are verified against config/routes.rb: the Core engine is mounted
# at "/", so the auth endpoints live at the application root.
class Rack::Attack
  # Shared counter store across Puma workers / servers (Solid Cache in prod).
  # MemoryStore would give each worker its own counters, multiplying limits.
  Rack::Attack.cache.store = Rails.cache

  ### Blocklist: security scanners (Fail2Ban) ###
  # Bots continuously probe for leaked secrets and admin panels (.env, .git,
  # wp-admin, *.php, …). Each probe is blocked immediately, and after 3 within
  # 10 minutes the IP is banned outright for 30 minutes (so it can't keep
  # probing other paths). Anchored to the path start so a legit route that
  # merely contains the substring is never matched.
  SCANNER_PATH = %r{\A/(?:\.env|\.aws|\.git|\.svn|\.ssh|\.DS_Store|wp-admin|wp-login|wp-content|wp-includes|xmlrpc|phpmyadmin|phpMyAdmin|administrator|cgi-bin|vendor/phpunit)}i

  blocklist("fail2ban-scanners") do |req|
    Rack::Attack::Fail2Ban.filter("scanners-#{req.ip}", maxretry: 3, findtime: 10.minutes, bantime: 30.minutes) do
      SCANNER_PATH.match?(req.path) || req.path.end_with?(".php")
    end
  end

  ### Throttles: auth endpoints, per IP ###
  # Login attempts — 5 per minute per IP.
  throttle("logins/ip", limit: 5, period: 60) do |req|
    req.ip if req.post? && req.path == "/sign_in"
  end

  # Login attempts — 5 per minute per email, so a single account can't be
  # brute-forced from a rotating pool of IPs. SessionsController reads the
  # email from params[:email] (top level), NOT params[:user][:email].
  throttle("logins/email", limit: 5, period: 60) do |req|
    if req.post? && req.path == "/sign_in"
      req.params["email"].to_s.strip.downcase.presence
    end
  end

  # Password-reset requests — 3 per hour per IP.
  throttle("password_resets/ip", limit: 3, period: 1.hour) do |req|
    req.ip if req.post? && req.path == "/forgot_password"
  end

  # Sign-ups — 5 per hour per IP (blunts mass account creation / email abuse).
  throttle("signups/ip", limit: 5, period: 1.hour) do |req|
    req.ip if req.post? && req.path == "/sign_up"
  end

  # Expensive AI generation endpoints — 10 per minute per IP. Covers the route
  # wizard, tutor chat, and image/audio generation (all POST). Paths verified
  # against `rails routes`: /routes/create, .../tutor_chats, .../generate.
  throttle("ai_generation/ip", limit: 10, period: 60) do |req|
    next unless req.post?
    path = req.path
    req.ip if path == "/routes/create" || path.end_with?("/tutor_chats", "/generate")
  end

  # General DDoS backstop — 300 requests / 5 min per IP. Excludes static
  # assets and the frequent status-poll endpoints (audio/image generation polls
  # every couple seconds), so normal heavy use never trips it.
  throttle("requests/ip", limit: 300, period: 5.minutes) do |req|
    unless req.path.start_with?("/assets", "/packs") || req.path.end_with?("/status", "/up")
      req.ip
    end
  end

  ### Safelist: never interfere with the health check ###
  safelist("allow-health-check") do |req|
    req.path == "/up"
  end

  ### Responses ###
  # Blocked scanners get a bare 404 — don't confirm to a scanner that the path
  # is special or that a filter exists.
  self.blocklisted_responder = lambda do |_req|
    [404, { "Content-Type" => "text/plain" }, ["Not found\n"]]
  end

  # Throttled requests get 429 with a Retry-After hint.
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
