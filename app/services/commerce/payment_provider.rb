# frozen_string_literal: true

module Commerce
  # The only surface the domain sees. Two operations, deliberately: create a
  # custom-price one-time checkout from an immutable quote, and verify/normalize
  # an inbound event. Anything wider would leak provider vocabulary into purchase
  # and entitlement rules and make a second provider a rewrite.
  module PaymentProvider
    Error          = Class.new(StandardError)
    SignatureError = Class.new(Error)

    Checkout = Data.define(:checkout_id, :checkout_url, :store_id, :product_id, :variant_id, :test_mode)

    Event = Data.define(
      :identity, :name, :test_mode, :store_id, :order_id, :checkout_id,
      :amount_cents, :currency, :actual_fee_cents, :refunded_amount_cents,
      :custom_route_id, :custom_quote_id, :custom_user_id, :status
    )

    Unavailable = Data.define(:reason, :missing) do
      def available? = false
    end

    Available = Data.define(:adapter) do
      def available? = true
    end

    REQUIRED_KEYS = %i[api_key signing_secret store_id product_id variant_id].freeze

    def self.configuration
      Rails.application.config.x.commerce_payment_provider || {}
    end

    # Fails closed. The missing list names CONFIGURATION KEYS only — never a
    # value, never a partial secret.
    def self.resolve(configuration: self.configuration)
      raw = (configuration || {}).symbolize_keys
      missing = REQUIRED_KEYS.filter_map { |key| "lemon_squeezy.#{key}" if raw[key].blank? }
      return Unavailable.new(reason: "payment_provider_unavailable", missing: missing) if missing.any?

      Available.new(adapter: Providers::LemonSqueezy.new(
        api_key: raw.fetch(:api_key), signing_secret: raw.fetch(:signing_secret),
        store_id: raw.fetch(:store_id).to_s, product_id: raw.fetch(:product_id).to_s,
        variant_id: raw.fetch(:variant_id).to_s, test_mode: raw.fetch(:test_mode, true)
      ))
    end
  end
end
