# frozen_string_literal: true

module Commerce
  module Providers
    # The only real adapter. Nothing on this branch calls `create_checkout`
    # against the network; WP-18 is verified against fixtures and the Fake.
    class LemonSqueezy
      API_ROOT = "https://api.lemonsqueezy.com/v1"
      SIGNATURE_ALGORITHM = "SHA256"

      def initialize(api_key:, signing_secret:, store_id:, product_id:, variant_id:, test_mode:)
        @api_key = api_key
        @signing_secret = signing_secret
        @store_id = store_id
        @product_id = product_id
        @variant_id = variant_id
        @test_mode = test_mode
      end

      def name = "lemon_squeezy"

      # Verification happens on the RAW BODY, before a single business field is
      # parsed. Anything else lets an attacker choose the fields we validate.
      def verify_event(raw_body:, signature:)
        raise SignatureError, "missing signature" if signature.blank? || raw_body.nil?

        expected = OpenSSL::HMAC.hexdigest(SIGNATURE_ALGORITHM, @signing_secret, raw_body)
        unless ActiveSupport::SecurityUtils.secure_compare(expected, signature.to_s)
          # The message deliberately carries no secret, no expected digest and no
          # body excerpt.
          raise SignatureError, "provider signature verification failed"
        end

        normalize(JSON.parse(raw_body))
      rescue JSON::ParserError
        raise PaymentProvider::Error, "provider event body was not valid JSON"
      end

      def create_checkout(quote:, user:, success_url:, cancel_url:)
        # The amount is the local quote's own final price, in cents. It is never
        # read back from the browser or recomputed from a provider response.
        payload = {
          data: {
            type: "checkouts",
            attributes: {
              custom_price: quote.final_price_cents,
              checkout_data: {
                email: user.email,
                custom: {
                  route_id: quote.learning_route_id,
                  quote_id: quote.id,
                  user_id: user.id
                }
              },
              product_options: { redirect_url: success_url },
              checkout_options: { embed: false },
              test_mode: @test_mode
            },
            relationships: {
              store:   { data: { type: "stores",   id: @store_id } },
              variant: { data: { type: "variants", id: @variant_id } }
            }
          }
        }

        response = post("#{API_ROOT}/checkouts", payload)
        attributes = response.dig("data", "attributes") || {}
        PaymentProvider::Checkout.new(
          checkout_id: response.dig("data", "id").to_s,
          checkout_url: attributes["url"].to_s,
          store_id: @store_id, product_id: @product_id, variant_id: @variant_id,
          test_mode: @test_mode
        )
      end

      private

      SignatureError = PaymentProvider::SignatureError

      def normalize(parsed)
        meta = parsed["meta"] || {}
        data = parsed["data"] || {}
        attributes = data["attributes"] || {}
        custom = (meta["custom_data"] || {})

        PaymentProvider::Event.new(
          # Lemon Squeezy does not send a stable event UUID on every payload, so
          # identity is the (event name, order id) pair, which IS stable across
          # retries and dashboard resends of the same order event.
          identity: "#{meta['event_name']}:#{data['id']}",
          name: meta["event_name"].to_s,
          test_mode: !!attributes["test_mode"],
          store_id: attributes["store_id"].to_s,
          order_id: data["id"].to_s,
          checkout_id: attributes["identifier"].to_s,
          amount_cents: integer_or_nil(attributes["total"]),
          currency: attributes["currency"].to_s,
          actual_fee_cents: integer_or_nil(attributes["fee"] || attributes["total_fee"]),
          refunded_amount_cents: integer_or_nil(attributes["refunded_amount"]),
          custom_route_id: custom["route_id"].presence&.to_s,
          custom_quote_id: custom["quote_id"].presence&.to_s,
          custom_user_id: custom["user_id"].presence&.to_s,
          status: attributes["status"].to_s
        )
      end

      # Money arrives as an integer number of cents or not at all. A String that
      # is not an exact integer is treated as absent rather than coerced.
      def integer_or_nil(value)
        return value if value.is_a?(Integer)
        return value.to_i if value.is_a?(String) && value.match?(/\A-?\d+\z/)

        nil
      end

      def post(url, payload)
        uri = URI.parse(url)
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true
        http.open_timeout = 10
        http.read_timeout = 20

        request = Net::HTTP::Post.new(uri)
        request["Authorization"] = "Bearer #{@api_key}"
        request["Accept"] = "application/vnd.api+json"
        request["Content-Type"] = "application/vnd.api+json"
        request.body = payload.to_json

        response = http.request(request)
        unless response.is_a?(Net::HTTPSuccess)
          # No body echo: a provider error page can contain request data.
          raise PaymentProvider::Error, "provider checkout creation failed with #{response.code}"
        end

        JSON.parse(response.body)
      rescue JSON::ParserError
        raise PaymentProvider::Error, "provider checkout response was not valid JSON"
      end
    end
  end
end
