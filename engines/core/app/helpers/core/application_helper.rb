module Core
  module ApplicationHelper
    # The layouts the core engine renders (and every engine whose controllers
    # inherit Core's) draw icons with svg_icon (STEP 41 §1.3); the engine is
    # isolated, so it reaches the app's helper this way.
    include ::ApplicationHelper

    def user_signed_in?
      current_user.present?
    end

    def user_role?(role)
      current_user&.role&.to_sym == role.to_sym
    end
  end
end
