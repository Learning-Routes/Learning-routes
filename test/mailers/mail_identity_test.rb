require "test_helper"

# Production mail must come from, and link to, the domain that exists and is
# authenticated: learningroutes.com. Resend verifies it (DKIM resend._domainkey,
# return-path send.learningroutes.com, DMARC). learning-routes.com has no DNS at all.
#
# Before this file: five engine mailers sent from noreply@learning-routes.com, so
# their mail failed SPF and DKIM alignment. Production built every email link on
# learning-routes.com, so a password reset linked to a host that does not resolve.
# Production also sent through Brevo, whose records were never added to the domain.
class MailIdentityTest < ActiveSupport::TestCase
  DOMAIN = "learningroutes.com".freeze
  PRODUCTION = Rails.root.join("config/environments/production.rb").read

  test "every mailer sends from the authenticated domain" do
    Rails.application.eager_load!
    mailers = ActionMailer::Base.descendants.reject { |m| m.name.nil? || m.abstract? }
    assert_operator mailers.size, :>=, 4, "the mailer sweep found too few mailers to mean anything"

    mailers.each do |mailer|
      from = Mail::Address.new(mailer.default[:from].to_s)
      assert_equal DOMAIN, from.domain, "#{mailer} sends from #{mailer.default[:from].inspect}"
    end
  end

  test "production sends through Resend with the key from credentials" do
    assert_match(/address:\s*"smtp\.resend\.com"/, PRODUCTION)
    assert_match(/user_name:\s*"resend"/, PRODUCTION)
    assert_match(/password:\s*Rails\.application\.credentials\.dig\(:resend, :api_key\)/, PRODUCTION)
    assert_no_match(/brevo/i, PRODUCTION, "Brevo's records were never added to the domain")
  end

  test "production builds every email link on the real domain, engines included" do
    hosts = PRODUCTION.scan(/host:\s*"([^"]+)"/).flatten

    assert_operator hosts.size, :>=, 3, "action_mailer, the app's routes and Core::Engine's routes each need a host"
    assert_equal [DOMAIN], hosts.uniq
    assert_equal DOMAIN, Rails.configuration.x.public_host, "mail links and the public host (STEP 36 §1) are one domain"
    assert_match(/Core::Engine\.routes\.default_url_options/, PRODUCTION,
      "engine URL helpers (core.reset_password_url) ignore action_mailer's defaults")
  end

  # A failed send used to log the address it was for: personal data in a log line.
  test "no log line writes a user's email address" do
    offenders = Dir[Rails.root.join("{app,engines/*/app}/**/*.rb")].flat_map do |file|
      File.readlines(file).each_with_index.filter_map do |line, index|
        "#{file.delete_prefix("#{Rails.root}/")}:#{index + 1}" if line.match?(/logger\.\w+\(.*#\{[^}]*\.email\b[^}]*\}/)
      end
    end

    assert_empty offenders
  end
end
