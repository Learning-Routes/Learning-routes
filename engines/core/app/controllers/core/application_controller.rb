module Core
  class ApplicationController < ActionController::Base
    private

    def current_user
      @current_user ||= Core::User.find_by(id: session[:user_id]) if session[:user_id]
    end
    helper_method :current_user

    def authenticate_user!
      redirect_to main_app.root_path, alert: "You must be signed in." unless current_user
    end

    def require_role(*roles)
      unless current_user&.role&.to_sym.in?(roles)
        redirect_to main_app.root_path, alert: "You are not authorized to perform this action."
      end
    end
  end
end
