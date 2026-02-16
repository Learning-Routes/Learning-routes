module Core
  class ApplicationController < ActionController::Base
    before_action :set_current_session

    private

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
        redirect_to core.sign_in_path, alert: "You must be signed in."
      end
    end

    def require_role(*roles)
      unless current_user&.role&.to_sym.in?(roles)
        redirect_to main_app.root_path, alert: "You are not authorized to perform this action."
      end
    end

    def after_sign_in_path(user = nil)
      user ||= current_user
      if user&.onboarding_completed?
        main_app.dashboard_path
      else
        core.onboarding_path
      end
    end

    def start_session_for(user, remember: false)
      sess = user.sessions.create!(
        ip_address: request.remote_ip,
        user_agent: request.user_agent,
        last_active_at: Time.current
      )
      session[:core_session_id] = sess.id

      # Reset memoized values so current_user reflects the new session
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
