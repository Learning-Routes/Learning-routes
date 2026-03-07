# Be sure to restart your server when you modify this file.

# Define an application-wide content security policy.
# See the Securing Rails Applications Guide for more information:
# https://guides.rubyonrails.org/security.html#content-security-policy-header

Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.font_src    :self, "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"
    policy.img_src     :self, :data, :https
    policy.object_src  :none
    policy.script_src  :self, "https://cdn.jsdelivr.net"
    policy.style_src   :self, :unsafe_inline, "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"
    policy.connect_src :self, "wss://learning-routes.com"
    policy.frame_src   :none
    policy.base_uri    :self
    policy.form_action :self
  end

  # Generate session nonces for permitted importmap and inline scripts.
  config.content_security_policy_nonce_generator = ->(_request) { SecureRandom.base64(16) }
  config.content_security_policy_nonce_directives = %w[script-src]

  # Enforce the CSP. All inline scripts use nonce attributes.
  config.content_security_policy_report_only = false
end
