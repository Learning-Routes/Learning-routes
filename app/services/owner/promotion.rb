module Owner
  class Promotion
    ADVISORY_LOCK_ID = 691_016

    class AuthenticationError < StandardError; end
    class OwnerExistsError < StandardError; end

    def self.call(email:, password:)
      user = Core::User.find_by(email: email.to_s.strip.downcase)
      unless user&.authenticate(password.to_s)
        raise AuthenticationError, "Owner promotion credentials are invalid"
      end

      Core::User.transaction do
        Core::User.connection.execute("SELECT pg_advisory_xact_lock(#{ADVISORY_LOCK_ID})")
        existing = Core::User.find_by(role: :owner)
        return existing if existing&.id == user.id
        raise OwnerExistsError, "An owner already exists" if existing

        user.update!(role: :owner)
        user.sessions.delete_all
        OwnerAuditEvent.record!(action: "owner.promoted", actor: user, subject: user)
        user
      end
    end
  end
end
