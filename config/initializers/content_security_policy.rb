# frozen_string_literal: true

# Content Security Policy (CSP).
# Turbo and Stimulus do NOT need unsafe-inline or unsafe-eval in script-src.
# Inline <script> tags get a per-request nonce (auto-injected by Rails).
# See https://guides.rubyonrails.org/security.html#content-security-policy-header

Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.font_src    :self, "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"
    # https: already covers these; GTM, GA4, Clarity and Preview mode's hosts are
    # named so the policy says what it serves.
    policy.img_src     :self, :data, :https,
      "https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.clarity.ms", "https://c.bing.com",
      "https://ssl.gstatic.com", "https://www.gstatic.com"
    policy.object_src  :none

    # Scripts: self + jsdelivr for the exact-version importmap pins (katex, ace,
    # mermaid, canvas-confetti, dompurify, pyodide). jsdelivr is a broad CDN, so
    # every pin MUST use an exact version (see config/importmap.rb).
    # Google Tag Manager, and what the owner runs through it (GA4, Microsoft
    # Clarity), per Google's CSP guide: the inline snippet runs under the nonce and
    # hands it on to gtm.js. tagmanager.google.com is GTM's Preview mode.
    policy.script_src  :self, "https://cdn.jsdelivr.net",
      "https://www.googletagmanager.com", "https://www.clarity.ms", "https://*.clarity.ms", "https://tagmanager.google.com"

    # Styles: self + Google Fonts + jsdelivr (katex CSS). :unsafe_inline is
    # required by the server-rendered inline styles in lesson content and the
    # Turbo progress bar; it does not weaken script protection.
    policy.style_src   :self, :unsafe_inline, "https://fonts.googleapis.com", "https://cdn.jsdelivr.net",
      "https://tagmanager.google.com", "https://www.googletagmanager.com" # GTM's Preview mode

    # Connections: self + ActionCable websockets. Both production hostnames are
    # served (see config/deploy.yml proxy host), so allow both; dev uses ws.
    # The old name stays until the owner redirects or drops it (STEP 36 §Owner 3);
    # test/config/one_public_host_test.rb allow-lists exactly this entry.
    ws_sources =
      if Rails.env.development? || Rails.env.test?
        ["ws://localhost:3000", "ws://127.0.0.1:3000"]
      else
        ["wss://learningroutes.com", "wss://learning-routes.com"]
      end
    # GTM, GA4's hits (regional *.google-analytics.com and *.google.com hosts)
    # and Microsoft Clarity's uploads.
    tag_sources = ["https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.google.com",
      "https://*.clarity.ms", "https://c.bing.com"]
    policy.connect_src :self, *ws_sources, *tag_sources

    # Media: lesson audio is same-origin (SectionAudioGenerator writes to
    # /storage/audio/sections/...), and `blob:` is the voice recorder's PREVIEW —
    # the student listening back to their own recording before sending it. There
    # was no media_src at all, so <audio> fell through to `default_src :self` and
    # every blob: preview was refused; the recorder logged "Failed to load
    # because no supported source was found" and the student could not hear
    # themselves.
    policy.media_src   :self, :blob

    # Workers: canvas-confetti builds its worker from a blob: URL. There was no
    # worker_src either, so it fell through to script_src and the celebration on
    # a correct answer never fired. (This closes WP-23 §3.)
    policy.worker_src  :self, :blob

    # Frames: allow same-origin so the code-playground sandbox iframe
    # (/sandbox.html) can load. It is additionally locked down with the
    # `sandbox="allow-scripts"` attribute (opaque origin).
    policy.frame_src   :self, "https://www.googletagmanager.com" # GTM's noscript iframe

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
