module Core
  class ApplicationController < ActionController::Base
    before_action :set_current_session
    before_action :set_locale
    before_action :set_theme
    before_action :require_email_verification!

    rescue_from ActiveRecord::RecordNotFound, with: :record_not_found

    private

    def require_email_verification!
      return unless current_user
      return if current_user.email_verified?
      return if verification_exempt_controller?

      redirect_to core.verify_pending_path
    end

    def verification_exempt_controller?
      exempt = %w[
        core/email_verifications
        core/sessions
        core/registrations
        core/passwords
        core/omniauth_callbacks
        landing
        locale
        theme
        pages
        rails/health
        rails/pwa
      ]
      exempt.include?(controller_path)
    end

    def set_locale
      locale = if current_user
        current_user.locale&.to_sym
      else
        cookies[:locale]&.to_sym
      end
      I18n.locale = I18n.available_locales.include?(locale) ? locale : I18n.default_locale
    end

    def current_locale
      I18n.locale
    end
    helper_method :current_locale

    def set_theme
      @current_theme = if current_user
        current_user.theme
      else
        cookies[:theme] || "system"
      end
    end

    def current_theme
      @current_theme || "system"
    end
    helper_method :current_theme

    def record_not_found
      respond_to do |format|
        format.html { render file: Rails.root.join("public/404.html"), status: :not_found, layout: false }
        format.turbo_stream { head :not_found }
        format.json { render json: { error: "Not found" }, status: :not_found }
      end
    end

    def current_user
      return @current_user if defined?(@current_user)
      @current_user = current_session&.user
    end
    helper_method :current_user

    def current_session
      return @current_session if defined?(@current_session)
      @current_session = find_session_from_cookie
    end

    def find_session_from_cookie
      if session[:core_session_id]
        sess = Core::Session.includes(:user).find_by(id: session[:core_session_id])
        if sess && !sess.expired?
          sess.touch_last_active! if sess.last_active_at.nil? || sess.last_active_at < 1.hour.ago
          return sess
        end

        # Session cookie pointed at a record that's missing or stale. Log a category
        # so "logged out unexpectedly" reports can be triaged, but DO NOT log user/
        # session IDs — those are PII when correlated with the IPs already captured
        # on Core::Session rows. Use debug-level for any per-request identifiers.
        reason = if sess.nil?
          "session_not_found"
        elsif sess.expired?
          "session_expired"
        else
          "unknown"
        end
        Rails.logger.info("[Auth] Dropping session cookie (#{reason}) — will try remember_token fallback if present")
        Rails.logger.debug { "[Auth] Dropped session_id=#{session[:core_session_id]}" }
        session.delete(:core_session_id)
      end

      recover_session_from_remember_token
    end

    def recover_session_from_remember_token
      payload = cookies.signed[:remember_token]
      return unless payload

      # Cookie payload is `[user_id, raw_token]`. Older deploys stored just the raw
      # token (a string); treat that as invalid and clear it — the user will simply
      # re-authenticate on next visit.
      unless payload.is_a?(Array) && payload.size == 2
        Rails.logger.info("[Auth] remember_token cookie has legacy format — clearing")
        cookies.delete(:remember_token)
        return
      end

      user_id, raw_token = payload
      user = Core::User.find_by_remember_credential(user_id: user_id, raw_token: raw_token)
      unless user
        Rails.logger.info("[Auth] remember_token did not match any user — deleting cookie")
        cookies.delete(:remember_token)
        return
      end

      sess = user.sessions.create!(
        ip_address: request.remote_ip,
        user_agent: request.user_agent,
        last_active_at: Time.current
      )
      session[:core_session_id] = sess.id
      Rails.logger.info("[Auth] Recovered session via remember_token")
      Rails.logger.debug { "[Auth] Recovered session for user=#{user.id} (new session=#{sess.id})" }
      sess
    end

    def set_current_session
      Current.user = current_user
    end

    def authenticate_user!
      unless current_user
        redirect_to core.sign_in_path, alert: t("flash.must_sign_in")
        return
      end
    end

    def require_role(*roles)
      unless current_user&.role&.to_sym.in?(roles)
        redirect_to main_app.root_path, alert: t("flash.not_authorized")
        return
      end
    end

    def after_sign_in_path(user = nil)
      main_app.profile_path
    end

    def start_session_for(user, remember: false)
      # Rotate the underlying Rails session ID on privilege change to defend
      # against session fixation (an attacker who set the pre-login session
      # cookie can no longer use it). reset_session wipes everything in the
      # session hash, so we must re-create our own keys after.
      reset_session

      sess = user.sessions.create!(
        ip_address: request.remote_ip,
        user_agent: request.user_agent,
        last_active_at: Time.current
      )
      session[:core_session_id] = sess.id

      remove_instance_variable(:@current_user) if defined?(@current_user)
      remove_instance_variable(:@current_session) if defined?(@current_session)

      if remember
        raw_token = user.remember!
        cookies.signed.permanent[:remember_token] = {
          # Pair the raw token with the user_id so DB lookup is by id, not
          # by token-as-key — no replay across users, even if (somehow) a
          # collision occurred. The cookie is signed so the user_id is
          # authenticated; the digest comparison validates the token.
          value: [user.id, raw_token],
          httponly: true,
          # Cover production AND any environment where the request is HTTPS
          # (staging, preview deploys) — Rails.env.production? alone misses
          # those. http://localhost dev still gets a non-secure cookie.
          secure: request.ssl? || Rails.env.production?,
          same_site: :lax
        }
      end
    end

    def end_session
      had_remember = cookies.signed[:remember_token].present?

      current_user&.forget! if had_remember
      current_session&.destroy
      session.delete(:core_session_id)
      cookies.delete(:remember_token)
      @current_user = nil
      @current_session = nil

      # Don't log user/session IDs at info — combined with IPs on Core::Session
      # rows that's PII. Categorical info is enough for triage.
      Rails.logger.info("[Auth] Sign-out — had_remember=#{had_remember}")
    end

    def google_oauth_enabled?
      Rails.application.credentials.dig(:google, :client_id).present? || ENV["GOOGLE_CLIENT_ID"].present?
    end
    helper_method :google_oauth_enabled?
  end
end
