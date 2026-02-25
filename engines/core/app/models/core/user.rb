module Core
  class User < ApplicationRecord
    has_secure_password

    has_many :sessions, dependent: :destroy
    has_many :route_requests, class_name: "::RouteRequest", foreign_key: :user_id, dependent: :destroy
    has_one :learning_profile, class_name: "LearningRoutesEngine::LearningProfile", dependent: :destroy

    # Community associations
    has_many :comments, class_name: "CommunityEngine::Comment", dependent: :destroy
    has_many :likes, class_name: "CommunityEngine::Like", dependent: :destroy
    has_many :activities, class_name: "CommunityEngine::Activity", dependent: :destroy
    has_many :notifications, class_name: "CommunityEngine::Notification", dependent: :destroy
    has_many :shared_routes, class_name: "CommunityEngine::SharedRoute", dependent: :destroy

    # Follower relationships
    has_many :active_follows, class_name: "CommunityEngine::Follow", foreign_key: :follower_id, dependent: :destroy
    has_many :passive_follows, class_name: "CommunityEngine::Follow", foreign_key: :followed_id, dependent: :destroy
    has_many :following, through: :active_follows, source: :followed
    has_many :followers, through: :passive_follows, source: :follower

    enum :role, { student: 0, teacher: 1, admin: 2 }

    VALID_THEMES = %w[light dark system].freeze

    validates :email, presence: true,
                      uniqueness: { case_sensitive: false },
                      format: { with: URI::MailTo::EMAIL_REGEXP }
    validates :name, presence: true, length: { minimum: 2, maximum: 100 }
    validates :password, length: { minimum: 8 }, if: -> { password.present? }
    validates :locale, inclusion: { in: %w[en es] }
    validates :theme, inclusion: { in: VALID_THEMES }
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

    # --- Theme helpers ---

    def dark_theme?
      theme == "dark"
    end

    def light_theme?
      theme == "light"
    end

    def system_theme?
      theme == "system"
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

    # --- Community helpers ---

    def following?(other_user)
      active_follows.exists?(followed_id: other_user.id)
    end

    def unread_notifications_count
      notifications.unread.count
    end
  end
end
