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

      quote = usable_quote
      return Rejected.new(reason: @quote_failure || "no_quote") if quote.nil?

      checkout = @adapter.create_checkout(
        quote: quote, user: @user, success_url: @success_url, cancel_url: @cancel_url
      )

      begin
        purchase = ActiveRecord::Base.transaction do
          # A resumed quote is ALREADY in `checkout`; `attach!` only moves
          # forward and would raise, which the rescue below would report to the
          # customer as `checkout_error` on the very path built to help them.
          quote.attach!("checkout") if quote.attachment_state == "unattached"
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
      rescue StandardError => e
        # The transaction rolled back — the quote is still unattached and no
        # purchase row exists. A checkout was created provider-side, but
        # reconciling that is Task 6's job (a verified webhook with no matching
        # pending purchase), not this one. Never log the amount, email or a
        # provider identifier here — the route id is enough to triage.
        Rails.logger.error("[Checkout] failed to record purchase for route #{@route.id}: #{e.class}")
        return Rejected.new(reason: "checkout_error")
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

    # The one place a checkout gets a price, in priority order.
    #
    # `RouteQuoteBuilder` used to have exactly ONE caller — WizardRouteGenerationJob,
    # at route creation — and `attach!` is one-way. So a customer who opened a
    # checkout and closed the tab moved the only quote to `checkout` forever,
    # and every later attempt found no unattached quote and was told the route
    # "does not have a price yet", permanently. Expiry reached the same dead end
    # from the other side. Giving this class the ability to obtain a quote is
    # what actually closes that, rather than patching one symptom.
    def usable_quote
      resumable_quote || unexpired_unattached_quote || requoted
    end

    # The returning customer. They were shown this price and walked away without
    # paying; they get the same price back, not a new one. Restricted to quotes
    # with no purchase row that reached `paid` — `already_purchased` above has
    # already handled the entitled case, so this only skips a quote whose
    # purchase is mid-flight.
    def resumable_quote
      RouteQuote.where(learning_route_id: @route.id, user_id: @user.id,
                       superseded_at: nil, attachment_state: "checkout")
                .where("expires_at > ?", Time.current)
                .where.not(id: RoutePurchase.paid.select(:route_quote_id))
                .order(created_at: :desc).first
    end

    def unexpired_unattached_quote
      RouteQuote.where(learning_route_id: @route.id, user_id: @user.id,
                       superseded_at: nil, attachment_state: "unattached")
                .where("expires_at > ?", Time.current)
                .order(created_at: :desc).first
    end

    # No usable quote: mint one. Deterministic for a route that is not changing
    # shape, so this is normally the same number the customer saw before.
    def requoted
      estimator = EstimatorConfiguration.call(route: @route)
      unless estimator.available?
        @quote_failure = "pricing_unavailable"
        return nil
      end

      result = RouteQuoteBuilder.call(
        route: @route,
        estimator_configuration: estimator.configuration,
        fee_configuration: Rails.application.config.x.commerce_fee_configuration
      )
      unless result.available?
        @quote_failure = result.reason == "no_paid_modules" ? "no_paid_modules" : "pricing_unavailable"
        return nil
      end

      honour_lower_price(result.quote)
    rescue StandardError => e
      Rails.logger.error("[Checkout] re-quote failed for route #{@route.id}: #{e.class}")
      @quote_failure = "pricing_unavailable"
      nil
    end

    # A re-quote must never raise the price on a customer who was already shown
    # a lower one for this route inside the honour window. Re-issued as a NEW
    # snapshot carrying the old pricing rather than by reviving the old row:
    # snapshots are immutable and an expired quote must stay expired, so the
    # audit trail keeps both.
    #
    # If the old pricing no longer validates — which happens precisely when the
    # owner has changed PricingConstants — the new quote stands. That is a
    # deliberate price change by the owner, not drift, and honouring a price the
    # owner has just retired would be the wrong answer.
    def honour_lower_price(fresh)
      previous = cheapest_price_shown_recently
      return fresh if previous.nil? || previous.final_price_cents >= fresh.final_price_cents

      reissue_pricing_of(previous, superseding: fresh)
    rescue ActiveRecord::RecordInvalid => e
      Rails.logger.info("[Checkout] could not honour the earlier price for route #{@route.id}: #{e.class}")
      fresh
    end

    def cheapest_price_shown_recently
      RouteQuote.where(learning_route_id: @route.id, user_id: @user.id)
                .where("created_at >= ?", Rails.application.config.x.commerce_quote_honour_window.ago)
                .order(:final_price_cents, :created_at).first
    end

    def reissue_pricing_of(previous, superseding:)
      attributes = previous.slice(*RouteQuote::IMMUTABLE_ATTRIBUTES - %w[user_id learning_route_id expires_at created_at])

      RouteQuote.create_snapshot!(
        attributes.symbolize_keys.merge(
          user: @user, learning_route: @route,
          expires_at: RouteQuote::DEFAULT_VALIDITY.from_now
        )
      ).tap do
        # create_snapshot! already superseded every other unattached quote for
        # the route, `superseding` included; reload so a caller holding it sees
        # that rather than a stale row.
        superseding.reload
      end
    end
  end
end
