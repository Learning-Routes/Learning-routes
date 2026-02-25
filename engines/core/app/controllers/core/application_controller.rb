module Core
  class ApplicationController < ActionController::Base
    before_action :set_current_session
    before_action :set_locale
    before_action :set_theme

    rescue_from ActiveRecord::RecordNotFound, with: :record_not_found

    private

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
      return unless session[:core_session_id]
      sess = Core::Session.includes(:user).find_by(id: session[:core_session_id])
      if sess && !sess.expired?
        sess.touch_last_active! if sess.last_active_at.nil? || sess.last_active_at < 1.hour.ago
        sess
      else
        session.delete(:core_session_id)
        nil
      end
    end

    def set_current_session
      Current.user = current_user
    end

    def authenticate_user!
      unless current_user
        redirect_to core.sign_in_path, alert: t("flash.must_sign_in")
      end
    end

    def require_role(*roles)
      unless current_user&.role&.to_sym.in?(roles)
        redirect_to main_app.root_path, alert: t("flash.not_authorized")
      end
    end

    def after_sign_in_path(user = nil)
      main_app.profile_path
    end

    def start_session_for(user, remember: false)
      sess = user.sessions.create!(
        ip_address: request.remote_ip,
        user_agent: request.user_agent,
        last_active_at: Time.current
      )
      session[:core_session_id] = sess.id

      remove_instance_variable(:@current_user) if defined?(@current_user)
      remove_instance_variable(:@current_session) if defined?(@current_session)

      if remember
        token = user.remember!
        cookies.signed.permanent[:remember_token] = {
          value: token,
          httponly: true,
          secure: Rails.env.production?
        }
      end
    end

    def end_session
      current_session&.destroy
      session.delete(:core_session_id)
      cookies.delete(:remember_token)
      @current_user = nil
      @current_session = nil
    end
  end
end
