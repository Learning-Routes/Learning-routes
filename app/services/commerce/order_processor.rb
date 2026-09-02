# frozen_string_literal: true

module Commerce
  # Turns a SIGNATURE-VERIFIED provider event into an entitlement, or refuses.
  #
  # The signature proves the message came from the provider. It proves nothing
  # about whether the message is about a route this user may buy, at the price
  # they were quoted, in the mode we are running. Every one of those is checked
  # here against local records before anything is written.
  class OrderProcessor
    Processed = Data.define(:purchase) do
      def processed? = true
    end
    Ignored = Data.define(:reason) do
      def processed? = false
    end
    Rejected = Data.define(:reason) do
      def processed? = false
    end

    SUPPORTED_EVENTS = %w[order_created].freeze

    # The name of the partial unique index that IS the single-paid-purchase
    # boundary. Only a violation of this specific constraint is a routine
    # concurrent-payment race; any other uniqueness violation is a real error
    # and must propagate, not be swallowed as "already paid".
    SINGLE_PAID_INDEX_NAME = "idx_route_purchases_single_paid"

    def self.call(event:, provider_name:)
      new(event, provider_name).call
    end

    def initialize(event, provider_name)
      @event = event
      @provider_name = provider_name
    end

    def call
      # Claim FIRST, regardless of event type. The unique index decides which
      # concurrent delivery of the same identity proceeds; the loser stops here
      # without touching a purchase. Claiming before the SUPPORTED_EVENTS check
      # (fix round 1, finding C1) means even an event type we do not process —
      # today that's only `order_refunded`, since Task 9 will intercept refunds
      # in the controller before OrderProcessor is ever consulted — is durably
      # recorded rather than silently dropped.
      record = ProviderEvent.claim!(
        provider: @provider_name, event_identity: @event.identity, event_name: @event.name,
        test_mode: @event.test_mode, evidence: evidence
      )
      return Ignored.new(reason: "duplicate_event") if record.nil?

      reason = rejection_reason
      if reason
        record.mark_rejected!(reason: reason)
        log_rejection(reason)
        return Rejected.new(reason: reason)
      end

      begin
        purchase = apply!
      rescue ActiveRecord::RecordNotUnique => e
        # Two DISTINCT event identities for the same route can both pass the
        # (unlocked) `already_paid` read above and both reach `apply!`. Only one
        # `mark_paid!` can win `idx_route_purchases_single_paid`; the loser's
        # write raises here. `apply!`'s own `transaction do...end` has already
        # rolled back by the time this rescue runs (Rails issues ROLLBACK before
        # re-raising out of the block), so the connection is clean and this
        # write below can still commit — positioning the rescue OUTSIDE that
        # transaction is exactly what avoids the poisoned-transaction trap
        # Task 3 hit with `ProviderEvent.claim!`.
        raise unless single_paid_purchase_conflict?(e)

        record.mark_rejected!(reason: "already_paid")
        log_rejection("already_paid")
        return Rejected.new(reason: "already_paid")
      end

      record.mark_processed!
      PaidModuleGenerationJob.perform_later(purchase.id)
      Processed.new(purchase: purchase)
    end

    private

    def log_rejection(reason)
      Rails.logger.error(
        "[Webhook] rejected #{@event.name} #{@event.identity}: #{reason} " \
        "route=#{@event.custom_route_id} quote=#{@event.custom_quote_id}"
      )
    end

    def single_paid_purchase_conflict?(error)
      (error.cause&.message || error.message).to_s.include?(SINGLE_PAID_INDEX_NAME)
    end

    def evidence
      {
        "order_id" => @event.order_id, "checkout_id" => @event.checkout_id,
        "store_id" => @event.store_id, "amount_cents" => @event.amount_cents,
        "currency" => @event.currency, "actual_fee_cents" => @event.actual_fee_cents,
        "route_id" => @event.custom_route_id, "quote_id" => @event.custom_quote_id,
        "user_id" => @event.custom_user_id, "status" => @event.status
      }.compact
    end

    def configured = PaymentProvider.configuration

    # Ordered cheapest-first, and each check names only what disagreed.
    #
    # RULING A: the brief's original last check was `unknown_purchase` — reject
    # when no pending RoutePurchase row exists. That loses money: CheckoutCreator
    # can create a provider-side checkout, have its local transaction fail (so
    # the quote rolls back to `unattached` and no purchase row is ever written),
    # and the customer is left having paid with nothing to show for it if the
    # verified webhook is then rejected. Once store, mode, currency, amount,
    # quote, user and route all validate, the quote alone determines user,
    # route, amount and currency — and `commerce_route_purchase_owner_guard`
    # independently enforces that — so a missing pending purchase is RECOVERED
    # in `apply!`, not rejected. `already_paid` is checked first so a route that
    # is genuinely already entitled (e.g. this event belongs to a superseded
    # quote) is never re-recovered into a second purchase.
    def rejection_reason
      return "unsupported_event" unless SUPPORTED_EVENTS.include?(@event.name)

      return "mode_mismatch" unless @event.test_mode == !!configured[:test_mode]
      return "store_mismatch" unless @event.store_id.to_s == configured[:store_id].to_s
      return "currency_mismatch" unless @event.currency == "USD"

      return "unknown_route" if route.nil?
      return "unknown_user"  if user.nil?
      return "unknown_quote" if quote.nil?
      return "ownership_mismatch" unless quote.user_id == user.id && quote.learning_route_id == route.id
      return "ownership_mismatch" unless LearningRoutesEngine::LearningProfile
        .where(id: route.learning_profile_id, user_id: user.id).exists?

      # The price is the LOCAL quote's, never the provider's claim.
      return "amount_mismatch" unless @event.amount_cents == quote.final_price_cents
      return "already_paid" if RoutePurchase.paid.where(learning_route_id: route.id).exists?

      if purchase
        return "quote_not_attached" unless quote.attachment_state == "checkout"
      else
        # No pending purchase to recover onto unless the quote is exactly where
        # a failed CheckoutCreator transaction would have left it: untouched.
        return "quote_not_attached" unless quote.attachment_state == "unattached"
      end

      nil
    end

    def route
      return @route if defined?(@route)

      @route = LearningRoutesEngine::LearningRoute.find_by(id: @event.custom_route_id)
    end

    def user
      return @user if defined?(@user)

      @user = Core::User.find_by(id: @event.custom_user_id)
    end

    def quote
      return @quote if defined?(@quote)

      @quote = RouteQuote.find_by(id: @event.custom_quote_id)
    end

    def purchase
      return @purchase if defined?(@purchase)

      @purchase = RoutePurchase.where(route_quote_id: quote&.id, learning_route_id: route&.id,
                                      user_id: user&.id, state: "pending")
                               .order(created_at: :desc).first
    end

    def apply!
      ActiveRecord::Base.transaction do
        target = purchase || recover_purchase!

        # `attach!` only moves one step at a time; a recovered purchase means
        # the quote is still `unattached`, so pass through `checkout` first.
        quote.attach!("checkout") if quote.attachment_state == "unattached"
        quote.attach!("purchase")

        target.mark_paid!(
          order_id: @event.order_id,
          actual_fee_cents: @event.actual_fee_cents,
          paid_at: Time.current,
          order_attributes: { provider_store_id: @event.store_id }
        )
        LearningRoutesEngine::RouteModule
          .where(learning_route_id: route.id, access_state: :locked)
          .update_all(access_state: LearningRoutesEngine::RouteModule.access_states[:purchased],
                      updated_at: Time.current)
        target
      end
    end

    # Recovery path (Ruling A): the provider-verified event is trusted to carry
    # a real order, but our own checkout write never landed. Rebuild the
    # pending purchase from the quote — the same source CheckoutCreator would
    # have used — so `mark_paid!` below has a row to move to `paid`.
    def recover_purchase!
      RoutePurchase.create!(
        user: user, learning_route: route, route_quote: quote,
        state: "pending", provider: @provider_name, test_mode: @event.test_mode,
        provider_checkout_id: @event.checkout_id, provider_store_id: @event.store_id,
        provider_product_id: configured[:product_id], provider_variant_id: configured[:variant_id],
        amount_cents: quote.final_price_cents, currency: quote.currency,
        estimated_ai_cost_microcents: quote.estimated_ai_cost_microcents,
        estimated_fee_cents: quote.estimated_fee_cents
      )
    end
  end
end
