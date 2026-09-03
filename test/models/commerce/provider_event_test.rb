require "test_helper"

class Commerce::ProviderEventTest < ActiveSupport::TestCase
  def claim(identity: "evt_1", name: "order_created")
    Commerce::ProviderEvent.claim!(
      provider: "lemon_squeezy", event_identity: identity, event_name: name,
      test_mode: true, evidence: { "order_id" => "ord_1", "amount_cents" => 299 }
    )
  end

  test "the first claim of an identity wins and the second returns nil" do
    first = claim
    assert first.present?
    assert_equal "pending", first.processing_state
    assert_nil claim, "a replayed event must not be claimable twice"
    assert_equal 1, Commerce::ProviderEvent.where(event_identity: "evt_1").count
  end

  test "two providers may share an event identity" do
    assert claim.present?
    other = Commerce::ProviderEvent.claim!(
      provider: "other_provider", event_identity: "evt_1", event_name: "order_created",
      test_mode: true, evidence: {}
    )
    assert other.present?
  end

  test "processing and rejection are recorded terminally" do
    event = claim
    event.mark_processed!
    assert_equal "processed", event.reload.processing_state
    assert event.processed_at.present?

    rejected = claim(identity: "evt_2")
    rejected.mark_rejected!(reason: "amount_mismatch")
    assert_equal "rejected", rejected.reload.processing_state
    assert_equal "amount_mismatch", rejected.rejection_reason
  end

  test "evidence rejects secret-looking keys and unbounded payloads" do
    assert_raises(ArgumentError) do
      Commerce::ProviderEvent.claim!(
        provider: "lemon_squeezy", event_identity: "evt_3", event_name: "order_created",
        test_mode: true, evidence: { "signing_secret" => "shhh" }
      )
    end
    assert_raises(ArgumentError) do
      Commerce::ProviderEvent.claim!(
        provider: "lemon_squeezy", event_identity: "evt_4", event_name: "order_created",
        test_mode: true, evidence: { "raw_payload" => "x" * 20_000 }
      )
    end
  end

  test "an unknown evidence key is rejected rather than stored" do
    assert_raises(ArgumentError) do
      Commerce::ProviderEvent.claim!(
        provider: "lemon_squeezy", event_identity: "evt_5", event_name: "order_created",
        test_mode: true, evidence: { "customer_full_name" => "Jane" }
      )
    end
  end

  test "a losing claim inside an enclosing transaction does not poison it" do
    first = nil
    second = :not_set
    survived = nil
    ActiveRecord::Base.transaction do
      first = claim(identity: "evt_tx")
      second = claim(identity: "evt_tx")
      # The whole point: a statement AFTER the losing claim must still work.
      survived = Commerce::ProviderEvent.where(event_identity: "evt_tx").count
    end

    assert first.present?
    assert_nil second
    assert_equal 1, survived
    assert_equal 1, Commerce::ProviderEvent.where(event_identity: "evt_tx").count
  end

  test "a unique violation on a different constraint is not swallowed as a replay" do
    # No second unique constraint exists on this table today besides the
    # primary key, so we force a primary-key collision (a real, distinct
    # unique index) through the private insertion path to prove the rescue
    # is targeted at idx_provider_events_identity specifically, not at
    # RecordNotUnique in general.
    id = SecureRandom.uuid
    first = Commerce::ProviderEvent.send(
      :insert_pending!, provider: "lemon_squeezy", event_identity: "evt_pk_a",
      event_name: "order_created", test_mode: true, evidence: {}, id: id
    )
    assert first.present?

    error = assert_raises(ActiveRecord::RecordNotUnique) do
      Commerce::ProviderEvent.send(
        :insert_pending!, provider: "lemon_squeezy", event_identity: "evt_pk_b",
        event_name: "order_created", test_mode: true, evidence: {}, id: id
      )
    end
    assert_match(/commerce_provider_events_pkey/, error.cause&.message || error.message)
  end
end
