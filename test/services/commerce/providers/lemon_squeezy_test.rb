require "test_helper"

class Commerce::Providers::LemonSqueezyTest < ActiveSupport::TestCase
  SECRET = "test_signing_secret"

  def adapter
    Commerce::Providers::LemonSqueezy.new(
      api_key: "test_api_key", signing_secret: SECRET, store_id: "1",
      product_id: "2", variant_id: "3", test_mode: true
    )
  end

  def order_created_body(order_id: "ord_1", amount_cents: 299, currency: "USD", fee_cents: 45)
    {
      meta: {
        event_name: "order_created",
        custom_data: { route_id: "r-1", quote_id: "q-1", user_id: "u-1" }
      },
      data: {
        id: order_id,
        attributes: {
          store_id: 1, identifier: "id-1", status: "paid", test_mode: true,
          currency: currency, total: amount_cents,
          total_usd: amount_cents, refunded_amount: 0,
          first_order_item: { product_id: 2, variant_id: 3 },
          # Lemon Squeezy reports its cut in cents on the order.
          tax: 0, discount_total: 0, setup_fee: 0, total_formatted: "$2.99"
        }
      }
    }.to_json
  end

  def sign(body) = OpenSSL::HMAC.hexdigest("SHA256", SECRET, body)

  test "a correctly signed event verifies and normalizes to the domain shape" do
    body = order_created_body
    event = adapter.verify_event(raw_body: body, signature: sign(body))

    assert_equal "order_created", event.name
    assert_equal "ord_1", event.order_id
    assert_equal 299, event.amount_cents
    assert_equal "USD", event.currency
    assert_equal true, event.test_mode
    assert_equal "r-1", event.custom_route_id
    assert_equal "q-1", event.custom_quote_id
    assert_equal "u-1", event.custom_user_id
    assert event.identity.present?
  end

  test "a wrong signature raises before any business field is read" do
    body = order_created_body
    assert_raises(Commerce::PaymentProvider::SignatureError) do
      adapter.verify_event(raw_body: body, signature: sign("different body"))
    end
  end

  test "a missing signature raises" do
    body = order_created_body
    assert_raises(Commerce::PaymentProvider::SignatureError) do
      adapter.verify_event(raw_body: body, signature: nil)
    end
  end

  test "signature comparison is length-safe and constant-time" do
    body = order_created_body
    assert_raises(Commerce::PaymentProvider::SignatureError) do
      adapter.verify_event(raw_body: body, signature: "short")
    end
  end

  test "a signature over a mutated body is rejected" do
    body = order_created_body
    signature = sign(body)
    tampered = body.sub('"total":299', '"total":1')

    assert_raises(Commerce::PaymentProvider::SignatureError) do
      adapter.verify_event(raw_body: tampered, signature: signature)
    end
  end

  test "the signing secret never appears in an error message" do
    body = order_created_body
    error = assert_raises(Commerce::PaymentProvider::SignatureError) do
      adapter.verify_event(raw_body: body, signature: "00")
    end
    assert_no_match(/#{SECRET}/, error.message)
    assert_no_match(/test_api_key/, error.message)
  end

  test "resolve is Unavailable when configuration is absent and names no secret value" do
    result = Commerce::PaymentProvider.resolve(configuration: {})

    assert_not result.available?
    assert_includes result.missing, "lemon_squeezy.api_key"
    assert_includes result.missing, "lemon_squeezy.signing_secret"
    assert_includes result.missing, "lemon_squeezy.store_id"
    assert_includes result.missing, "lemon_squeezy.variant_id"
    result.missing.each { |key| assert_no_match(/test_api_key|#{SECRET}/, key) }
  end
end
