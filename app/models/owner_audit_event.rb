class OwnerAuditEvent < ApplicationRecord
  belongs_to :actor_user, class_name: "Core::User", optional: true
  belongs_to :subject_user, class_name: "Core::User", optional: true

  validates :action, presence: true
  validate :metadata_contains_no_sensitive_keys

  before_update { throw(:abort) }
  before_destroy { throw(:abort) }

  SENSITIVE_KEYS = /email|password|secret|token|credential|prompt|response/i

  def self.record!(action:, actor: nil, subject: nil, request: nil, metadata: {})
    create!(
      action: action,
      actor_user: actor,
      subject_user: subject,
      request_id: request&.request_id,
      ip_digest: digest(request&.remote_ip),
      user_agent_digest: digest(request&.user_agent),
      metadata: metadata
    )
  end

  def self.digest(value)
    Digest::SHA256.hexdigest(value) if value.present?
  end

  private

  def metadata_contains_no_sensitive_keys
    keys = metadata.to_h.keys.map(&:to_s)
    errors.add(:metadata, "contains a sensitive key") if keys.any? { |key| key.match?(SENSITIVE_KEYS) }
  end
end
