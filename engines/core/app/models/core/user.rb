module Core
  class User < ApplicationRecord
    include Core::Authenticatable
    include Core::Authorizable

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
  end
end
