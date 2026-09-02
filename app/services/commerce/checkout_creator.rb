# frozen_string_literal: true

module Commerce
  # Quote -> provider checkout -> pending purchase, in one transaction.
  #
  # Everything monetary comes from the local quote. The request supplies a route
  # id and nothing else; there is no price, quantity or currency parameter to
  # tamper with.
  class CheckoutCreator
    Created  = Data.define(:purchase, :checkout_url) do
      def created? = true
    end
    Rejected = Data.define(:reason) do
      def created? = false
    end

    def self.call(user:, route:, adapter:, success_url:, cancel_url:)
      new(user, route, adapter, success_url, cancel_url).call
    end

    def initialize(user, route, adapter, success_url, cancel_url)
      @user = user
      @route = route
      @adapter = adapter
      @success_url = success_url
      @cancel_url = cancel_url
    end

    def call
      return Rejected.new(reason: "not_owner") unless owner?
      return Rejected.new(reason: "already_purchased") if RoutePurchase.entitled?(route_id: @route.id)

      quote = active_quote
      return Rejected.new(reason: "no_quote") if quote.nil?
      return Rejected.new(reason: "quote_expired") if quote.expires_at <= Time.current

      checkout = @adapter.create_checkout(
        quote: quote, user: @user, success_url: @success_url, cancel_url: @cancel_url
      )

      purchase = ActiveRecord::Base.transaction do
        quote.attach!("checkout")
        RoutePurchase.create!(
          user: @user, learning_route: @route, route_quote: quote,
          state: "pending", provider: @adapter.name, test_mode: checkout.test_mode,
          provider_checkout_id: checkout.checkout_id, provider_store_id: checkout.store_id,
          provider_product_id: checkout.product_id, provider_variant_id: checkout.variant_id,
          amount_cents: quote.final_price_cents, currency: quote.currency,
          estimated_ai_cost_microcents: quote.estimated_ai_cost_microcents,
          estimated_fee_cents: quote.estimated_fee_cents
        )
      end

      Created.new(purchase: purchase, checkout_url: checkout.checkout_url)
    rescue PaymentProvider::Error => e
      # The quote is untouched, so the customer can retry at the same price.
      Rails.logger.warn("[Checkout] provider error for route #{@route.id}: #{e.class}")
      Rejected.new(reason: "provider_error")
    end

    private

    def owner?
      LearningRoutesEngine::LearningProfile
        .where(id: @route.learning_profile_id, user_id: @user.id).exists?
    end

    def active_quote
      RouteQuote.where(learning_route_id: @route.id, user_id: @user.id,
                       superseded_at: nil, attachment_state: "unattached")
                .order(created_at: :desc).first
    end
  end
end
