module Core
  module ApplicationHelper
    def current_user
      @current_user ||= Core::User.find_by(id: session[:user_id]) if session[:user_id]
    end

    def user_signed_in?
      current_user.present?
    end

    def user_role?(role)
      current_user&.role&.to_sym == role.to_sym
    end
  end
end
