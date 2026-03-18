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

      # Second: find by email (link OAuth to existing email/password account)
      user = Core::User.find_by(email: auth.info.email&.strip&.downcase)
      if user
        user.update!(
          provider: auth.provider,
          uid: auth.uid,
          avatar_url: auth.info.image,
          email_verified_at: user.email_verified_at || Time.current
        )
        return user
      end

      # Third: create new user
      Core::User.create!(
        name: auth.info.name,
        email: auth.info.email,
        provider: auth.provider,
        uid: auth.uid,
        avatar_url: auth.info.image,
        email_verified_at: Time.current,
        password: SecureRandom.urlsafe_base64(32),
        role: :student,
        locale: extract_locale
      )
    rescue ActiveRecord::RecordInvalid => e
      Rails.logger.error("[OAUTH FAILURE] Could not create/link user: #{e.message}")
      nil
    end

    def extract_locale
      browser_locale = request.env["HTTP_ACCEPT_LANGUAGE"]&.scan(/^[a-z]{2}/)&.first
      %w[en es].include?(browser_locale) ? browser_locale : "es"
    end
  end
end
