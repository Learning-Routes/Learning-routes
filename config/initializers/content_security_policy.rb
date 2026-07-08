# frozen_string_literal: true

# Content Security Policy (CSP).
# Turbo and Stimulus do NOT need unsafe-inline or unsafe-eval in script-src.
# Inline <script> tags get a per-request nonce (auto-injected by Rails).
# See https://guides.rubyonrails.org/security.html#content-security-policy-header

Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.font_src    :self, "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"
    policy.img_src     :self, :data, :https
    policy.object_src  :none

    # Scripts: self + jsdelivr for the exact-version importmap pins (katex, ace,
    # mermaid, canvas-confetti, dompurify, pyodide). jsdelivr is a broad CDN, so
    # every pin MUST use an exact version (see config/importmap.rb).
    policy.script_src  :self, "https://cdn.jsdelivr.net"

    # Styles: self + Google Fonts + jsdelivr (katex CSS). :unsafe_inline is
    # required by the server-rendered inline styles in lesson content and the
    # Turbo progress bar; it does not weaken script protection.
    policy.style_src   :self, :unsafe_inline, "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"

    # Connections: self + ActionCable websockets. Both production hostnames are
    # served (see config/deploy.yml proxy host), so allow both; dev uses ws.
    ws_sources =
      if Rails.env.development? || Rails.env.test?
        ["ws://localhost:3000", "ws://127.0.0.1:3000"]
      else
        ["wss://learningroutes.com", "wss://learning-routes.com"]
      end
    policy.connect_src :self, *ws_sources

    # Frames: allow same-origin so the code-playground sandbox iframe
    # (/sandbox.html) can load. It is additionally locked down with the
    # `sandbox="allow-scripts"` attribute (opaque origin).
    policy.frame_src   :self

    # Clickjacking: this app may not be framed by anyone.
    policy.frame_ancestors :none

    policy.base_uri    :self
    policy.form_action :self, "https://accounts.google.com"
  end

  # Per-request nonce from SecureRandom (never session-derived), applied to
  # inline <script> tags only.
  config.content_security_policy_nonce_generator = ->(_request) { SecureRandom.base64(16) }
  config.content_security_policy_nonce_directives = %w[script-src]

  # Enforce (not report-only).
  config.content_security_policy_report_only = false
end
