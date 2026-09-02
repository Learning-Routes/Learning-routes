# frozen_string_literal: true

module Commerce
  # One row per provider event identity. The unique index is the idempotency
  # boundary: a replay loses the insert race and is not processed again.
  #
  # `evidence` is a NARROW allowlist of reconciliation facts. The spec forbids
  # retaining an unrestricted raw payload or unnecessary personal data, so an
  # unknown key is an error rather than something to store and forget.
  class ProviderEvent < ApplicationRecord
    self.table_name = "commerce_provider_events"

    PROCESSING_STATES = %w[pending processed rejected].freeze

    EVIDENCE_KEYS = %w[
      order_id checkout_id store_id product_id variant_id
      amount_cents currency actual_fee_cents refunded_amount_cents
      route_id quote_id user_id status occurred_at
    ].freeze

    MAX_EVIDENCE_BYTES = 8_192

    validates :provider, :event_identity, :event_name, presence: true
    validates :processing_state, inclusion: { in: PROCESSING_STATES }
    validates :test_mode, inclusion: { in: [true, false] }

    def self.claim!(provider:, event_identity:, event_name:, test_mode:, evidence:)
      safe = sanitize_evidence(evidence)
      create!(provider: provider, event_identity: event_identity, event_name: event_name,
              test_mode: test_mode, evidence: safe, processing_state: "pending")
    rescue ActiveRecord::RecordNotUnique
      nil
    end

    def self.sanitize_evidence(evidence)
      hash = (evidence || {}).to_h.transform_keys(&:to_s)
      unknown = hash.keys - EVIDENCE_KEYS
      raise ArgumentError, "unsupported provider evidence keys: #{unknown.sort.join(', ')}" if unknown.any?
      if hash.to_json.bytesize > MAX_EVIDENCE_BYTES
        raise ArgumentError, "provider evidence exceeds #{MAX_EVIDENCE_BYTES} bytes"
      end

      hash
    end

    def mark_processed!
      update!(processing_state: "processed", processed_at: Time.current, rejection_reason: nil)
    end

    def mark_rejected!(reason:)
      update!(processing_state: "rejected", processed_at: Time.current,
              rejection_reason: reason.to_s.truncate(255))
    end
  end
end
