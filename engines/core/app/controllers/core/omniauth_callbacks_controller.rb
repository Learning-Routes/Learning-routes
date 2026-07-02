module Core
  class OmniauthCallbacksController < ApplicationController
    skip_before_action :require_email_verification!

    def google_oauth2
      auth = request.env["omniauth.auth"]

      unless auth
        redirect_to core.sign_in_path, alert: t("flash.oauth_failed")
        return
      end

      user = find_or_create_user(auth)

      if user&.persisted?
        start_session_for(user)
        redirect_to after_sign_in_path(user), notice: t("flash.signed_in")
      else
        redirect_to core.sign_in_path, alert: t("flash.oauth_failed")
      end
    end

    def failure
      redirect_to core.sign_in_path, alert: t("flash.oauth_failed")
    end

    private

    def find_or_create_user(auth)
      # First: find by provider + uid (returning OAuth user)
      user = Core::User.find_by(provider: auth.provider, uid: auth.uid)
      return user if user

      email = auth.info.email&.strip&.downcase
      return nil if email.blank?

      google_verified = google_email_verified?(auth)

      # Second: link OAuth to an existing local account matched by email.
      user = Core::User.find_by(email: email)
      if user
        # Pre-hijack guard: only link if we can prove the person signing in owns
        # this email. Either the local account was already verified (ownership
        # proven earlier), or Google asserts the email is verified. Otherwise an
        # attacker could have pre-registered this email locally with a password
        # and would gain access the moment the real owner signs in with Google.
        return nil unless user.email_verified? || google_verified

        attrs = {
          provider: auth.provider,
          uid: auth.uid,
          avatar_url: auth.info.image,
          email_verified_at: user.email_verified_at || Time.current
        }
        # When linking onto an account that was NOT already verified, a squatter
        # may have set its password. Rotate it so only Google login (or an
        # explicit password reset by the real owner) works from now on.
        attrs[:password] = SecureRandom.urlsafe_base64(32) unless user.email_verified?

        user.update!(attrs)
        return user
      end

      # Third: create a new user. Only mark the email verified if Google says so.
      Core::User.create!(
        name: auth.info.name,
        email: email,
        provider: auth.provider,
        uid: auth.uid,
        avatar_url: auth.info.image,
        email_verified_at: google_verified ? Time.current : nil,
        password: SecureRandom.urlsafe_base64(32),
        role: :student,
        locale: extract_locale
      )
    rescue ActiveRecord::RecordInvalid => e
      Rails.logger.error("[OAUTH FAILURE] Could not create/link user: #{e.message}")
      nil
    end

    # Google returns email_verified as either true or the string "true"
    # (see omniauth-google-oauth2). Treat only those as verified.
    def google_email_verified?(auth)
      claim = auth.info.email_verified
      claim = auth.extra&.raw_info&.[]("email_verified") if claim.nil? && auth.extra.respond_to?(:raw_info)
      [true, "true"].include?(claim)
    end

    def extract_locale
      browser_locale = request.env["HTTP_ACCEPT_LANGUAGE"]&.scan(/^[a-z]{2}/)&.first
      %w[en es].include?(browser_locale) ? browser_locale : "es"
    end
  end
end
