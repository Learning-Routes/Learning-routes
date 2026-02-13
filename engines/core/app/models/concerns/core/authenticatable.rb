module Core
  module Authenticatable
    extend ActiveSupport::Concern

    included do
      has_secure_password
    end

    class_methods do
      def authenticate_by_email(email, password)
        user = find_by(email: email.to_s.strip.downcase)
        user&.authenticate(password)
      end
    end

    def generate_token_for(purpose, expires_in: 24.hours)
      self.class.generate_token_for(purpose, expires_in: expires_in) { { id: id } }
    end
  end
end
