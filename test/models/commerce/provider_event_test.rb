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
end
