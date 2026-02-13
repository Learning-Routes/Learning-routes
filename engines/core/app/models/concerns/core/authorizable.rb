module Core
  module Authorizable
    extend ActiveSupport::Concern

    def can_manage_users?
      admin?
    end

    def can_manage_content?
      admin? || teacher?
    end

    def can_access_analytics?
      admin? || teacher?
    end

    def can_create_routes?
      true # All roles can create learning routes
    end

    def authorized_for?(action)
      case action.to_sym
      when :manage_users then can_manage_users?
      when :manage_content then can_manage_content?
      when :access_analytics then can_access_analytics?
      when :create_routes then can_create_routes?
      else false
      end
    end
  end
end
