require "test_helper"

class Commerce::Providers::LemonSqueezyTest < ActiveSupport::TestCase
  SECRET = "test_signing_secret"

  def adapter
    Commerce::Providers::LemonSqueezy.new(
      api_key: "test_api_key", signing_secret: SECRET, store_id: "1",
      product_id: "2", variant_id: "3", test_mode: true
    )
  end

  # Shaped like a real Lemon Squeezy order: `subtotal` is what we charged for
  # the item (the `custom_price` we sent), `tax` is added on top as merchant of
  # record, and `total` is the post-tax sum the customer's card was charged.
  def order_created_body(order_id: "ord_1", subtotal_cents: 299, tax_cents: 0,
                         discount_cents: 0, currency: "USD", fee_cents: 45)
    total = subtotal_cents - discount_cents + tax_cents
    {
      meta: {
        event_name: "order_created",
        custom_data: { route_id: "r-1", quote_id: "q-1", user_id: "u-1" }
      },
      data: {
        id: order_id,
        attributes: {
          store_id: 1, identifier: "id-1", status: "paid", test_mode: true,
          currency: currency, subtotal: subtotal_cents, total: total,
          total_usd: total, refunded_amount: 0,
          first_order_item: { product_id: 2, variant_id: 3 },
          # Lemon Squeezy reports its cut in cents on the order.
          tax: tax_cents, discount_total: discount_cents, setup_fee: 0,
          total_formatted: "$#{format('%.2f', total / 100.0)}"
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

  # Lemon Squeezy is the merchant of record and adds VAT/sales tax on top of the
  # custom price we set. Reading `total` made a legitimately paid order look
  # like an `amount_mismatch` for every customer in a taxed jurisdiction.
  test "a taxed order reports the item subtotal, not the post-tax total" do
    body = order_created_body(subtotal_cents: 299, tax_cents: 60)
    event = adapter.verify_event(raw_body: body, signature: sign(body))

    assert_equal 299, event.amount_cents
  end

  # A discount means the customer did not pay the quoted price, so the amount
  # must fail the quote's equality check rather than entitle at a price we
  # never offered.
  test "a discounted order reports less than the quoted price" do
    body = order_created_body(subtotal_cents: 299, discount_cents: 100, tax_cents: 60)
    event = adapter.verify_event(raw_body: body, signature: sign(body))

    assert_equal 199, event.amount_cents
  end

  # `identifier` is the ORDER's UUID. Storing it as the checkout id produced
  # purchase rows that could never be reconciled against a real checkout.
  test "an order payload yields no checkout id" do
    body = order_created_body
    event = adapter.verify_event(raw_body: body, signature: sign(body))

    assert_nil event.checkout_id
    assert_equal "ord_1", event.order_id
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
