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
      amount_cents discount_cents currency actual_fee_cents refunded_amount_cents
      route_id quote_id user_id status occurred_at
    ].freeze

    MAX_EVIDENCE_BYTES = 8_192

    # The name of the unique index that IS the idempotency boundary. Only a
    # violation of this specific constraint means "already claimed" — any
    # other uniqueness violation (e.g. a future constraint) is a real error
    # and must propagate, not be swallowed as a routine replay.
    IDENTITY_INDEX_NAME = "idx_provider_events_identity"

    validates :provider, :event_identity, :event_name, presence: true
    validates :processing_state, inclusion: { in: PROCESSING_STATES }
    validates :test_mode, inclusion: { in: [true, false] }

    def self.claim!(provider:, event_identity:, event_name:, test_mode:, evidence:)
      insert_pending!(provider: provider, event_identity: event_identity, event_name: event_name,
                       test_mode: test_mode, evidence: sanitize_evidence(evidence))
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

    # Give the identity back so the provider's next delivery is processed
    # instead of being answered "duplicate" forever.
    #
    # Only for the case where processing failed BEFORE anything was written:
    # the claim is what makes a replay a no-op, so releasing it after a
    # successful write would let the same event be applied twice. OrderProcessor
    # calls this only from the rescue around its (transactional, already
    # rolled-back) `apply!`.
    def release!
      destroy!
    end

    def mark_rejected!(reason:)
      update!(processing_state: "rejected", processed_at: Time.current,
              rejection_reason: reason.to_s.truncate(255))
    end

    # `id:` is accepted only so a losing insert against a DIFFERENT unique
    # constraint (e.g. the primary key) can be forced in tests — production
    # callers always go through `claim!`, which never passes it.
    def self.insert_pending!(provider:, event_identity:, event_name:, test_mode:, evidence:, id: nil)
      attributes = { provider: provider, event_identity: event_identity, event_name: event_name,
                     test_mode: test_mode, evidence: evidence, processing_state: "pending" }
      attributes[:id] = id if id

      # A unique violation aborts the whole enclosing PG transaction, not just
      # the failed statement. `requires_new: true` opens a SAVEPOINT so the
      # losing claim rolls back to it instead of poisoning a caller's
      # transaction (Task 6 calls `claim!` inside one before touching a
      # purchase).
      ActiveRecord::Base.transaction(requires_new: true) { create!(attributes) }
    rescue ActiveRecord::RecordNotUnique => e
      raise unless identity_index_conflict?(e)

      nil
    end
    private_class_method :insert_pending!

    def self.identity_index_conflict?(error)
      (error.cause&.message || error.message).to_s.include?(IDENTITY_INDEX_NAME)
    end
    private_class_method :identity_index_conflict?
  end
end
