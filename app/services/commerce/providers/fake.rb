# frozen_string_literal: true

module Commerce
  module Providers
    # Test double with the same signatures as the real adapter. It never touches
    # the network, so no test in this package can accidentally call a provider.
    class Fake
      attr_reader :created_checkouts

      def initialize(signing_secret: "fake_secret", store_id: "1", product_id: "2",
                     variant_id: "3", test_mode: true)
        @signing_secret = signing_secret
        @store_id = store_id
        @product_id = product_id
        @variant_id = variant_id
        @test_mode = test_mode
        @created_checkouts = []
      end

      def name = "lemon_squeezy"

      def create_checkout(quote:, user:, success_url:, cancel_url:)
        checkout = PaymentProvider::Checkout.new(
          checkout_id: "chk_#{quote.id}", checkout_url: "https://example.test/checkout/#{quote.id}",
          store_id: @store_id, product_id: @product_id, variant_id: @variant_id, test_mode: @test_mode
        )
        @created_checkouts << { quote_id: quote.id, user_id: user.id, amount_cents: quote.final_price_cents }
        checkout
      end

      def verify_event(raw_body:, signature:)
        expected = OpenSSL::HMAC.hexdigest("SHA256", @signing_secret, raw_body.to_s)
        unless signature.present? && ActiveSupport::SecurityUtils.secure_compare(expected, signature.to_s)
          raise PaymentProvider::SignatureError, "provider signature verification failed"
        end

        LemonSqueezy.new(api_key: "x", signing_secret: @signing_secret, store_id: @store_id,
                         product_id: @product_id, variant_id: @variant_id, test_mode: @test_mode)
                    .send(:normalize, JSON.parse(raw_body))
      end

      def sign(raw_body) = OpenSSL::HMAC.hexdigest("SHA256", @signing_secret, raw_body)
    end
  end
end
