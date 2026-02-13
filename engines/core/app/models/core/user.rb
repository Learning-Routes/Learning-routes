module Core
  class User < ApplicationRecord
    has_secure_password

    has_many :sessions, dependent: :destroy

    enum :role, { student: 0, teacher: 1, admin: 2 }

    validates :email, presence: true,
                      uniqueness: { case_sensitive: false },
                      format: { with: URI::MailTo::EMAIL_REGEXP }
    validates :name, presence: true, length: { minimum: 2, maximum: 100 }
    validates :password, length: { minimum: 8 }, if: -> { password.present? }
    validates :locale, inclusion: { in: %w[en es] }
    validates :role, presence: true

    normalizes :email, with: ->(email) { email.strip.downcase }

    scope :by_role, ->(role) { where(role: role) }
    scope :recently_active, -> { order(updated_at: :desc) }
    scope :verified, -> { where.not(email_verified_at: nil) }
    scope :onboarded, -> { where(onboarding_completed: true) }

    # --- Authorization helpers ---

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
      true
    end

    # --- Email verification ---

    def email_verified?
      email_verified_at.present?
    end

    def verify_email!
      update!(email_verified_at: Time.current)
    end

    # --- Remember me ---

    def remember!
      token = SecureRandom.urlsafe_base64(32)
      update!(remember_token: token)
      token
    end

    def forget!
      update!(remember_token: nil)
    end

    # --- Onboarding ---

    def onboarding_completed?
      onboarding_completed
    end

    def complete_onboarding!
      update!(onboarding_completed: true)
    end

    # --- Token generation for email verification / password reset ---

    generates_token_for :email_verification, expires_in: 24.hours
    generates_token_for :password_reset, expires_in: 1.hour
  end
end
