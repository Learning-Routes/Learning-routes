module Core
  module ApplicationHelper
    def user_signed_in?
      current_user.present?
    end

    def user_role?(role)
      current_user&.role&.to_sym == role.to_sym
    end
  end
end
