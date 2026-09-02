require "test_helper"

module Commerce
  class OrderProcessorTest < ActiveSupport::TestCase
    # ActiveSupport::TestCase does not include the ActiveJob assertions by default.
    include ActiveJob::TestHelper

    def setup
      # OrderProcessor validates the event's store/mode against
      # `PaymentProvider.configuration` directly (not against whichever adapter
      # verified the signature), and no credentials/ENV are set in the test
      # environment, so it is stubbed here to agree with `Providers::Fake`'s
      # own defaults (store_id "1", test_mode true).
      @original_provider_config = Rails.application.config.x.commerce_payment_provider
      Rails.application.config.x.commerce_payment_provider = {
        api_key: "key", signing_secret: "fake_secret", store_id: "1",
        product_id: "2", variant_id: "3", test_mode: true
      }

      @user = Core::User.create!(
        name: "Buyer", email: "buy-#{SecureRandom.hex(4)}@example.com",
        password: "password123", password_confirmation: "password123",
        email_verified_at: Time.current
      )
      @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: @profile, topic: "AWS", locale: "en", status: :active
      )
      @paid_module = LearningRoutesEngine::RouteModule.create!(
        learning_route: @route, position: 2, title: "Paid", access_state: :locked, generation_state: :outlined
      )
      @quote = build_quote(route: @route)

      # A pending purchase created the ordinary way, through CheckoutCreator
      # with the Fake provider, exactly as the brief specifies.
      checkout_result = Commerce::CheckoutCreator.call(
        user: @user, route: @route, adapter: Commerce::Providers::Fake.new,
        success_url: "https://example.test/ok", cancel_url: "https://example.test/no"
      )
      raise "setup failed to create a checkout: #{checkout_result.try(:reason)}" unless checkout_result.created?

      @pending_purchase = checkout_result.purchase
    end

    def teardown
      Rails.application.config.x.commerce_payment_provider = @original_provider_config
    end

    def build_quote(route:, user: @user)
      Commerce::RouteQuote.create_snapshot!(
        user: user, learning_route: route, currency: "USD",
        total_module_count: 2, paid_module_count: 1,
        estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40,
        markup_basis_points: Commerce::PricingConstants::MARKUP_BASIS_POINTS,
        minimum_price_per_paid_module_cents: Commerce::PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS,
        cost_based_price_cents: 210, minimum_price_cents: 299, final_price_cents: 299,
        estimator_version: "wp18-v1", provider_rate_versions: { "gpt-5.2" => "2026-08-31" },
        fee_version: "ls-test-v1", image_quality: "medium",
        route_shape_assumptions: { "outline" => [] }, provider_rate_assumptions: { "gpt-5.2" => {} },
        fee_assumptions: { "version" => "ls-test-v1" }, expires_at: 24.hours.from_now
      )
    end

    def event(**overrides)
      Commerce::PaymentProvider::Event.new(**{
        identity: "order_created:ord_1", name: "order_created", test_mode: true,
        store_id: "1", order_id: "ord_1", checkout_id: "chk_#{@quote.id}",
        amount_cents: @quote.final_price_cents, currency: "USD",
        actual_fee_cents: 45, refunded_amount_cents: 0,
        custom_route_id: @route.id, custom_quote_id: @quote.id, custom_user_id: @user.id,
        status: "paid"
      }.merge(overrides))
    end

    def process(e = event) = Commerce::OrderProcessor.call(event: e, provider_name: "lemon_squeezy")

    test "a valid order marks the purchase paid and records the actual fee" do
      result = process

      assert result.processed?, result.try(:reason)
      purchase = result.purchase.reload
      assert_equal "paid", purchase.state
      assert_equal "ord_1", purchase.provider_order_id
      assert_equal 45, purchase.actual_fee_cents
      assert_equal "purchase", @quote.reload.attachment_state
    end

    test "replaying the same event does not create a second purchase or re-enqueue generation" do
      process
      assert_enqueued_jobs 0 do
        second = process
        assert_not second.processed?
        assert_equal "duplicate_event", second.reason
      end
      assert_equal 1, Commerce::RoutePurchase.paid.where(learning_route_id: @route.id).count
    end

    test "an amount that disagrees with the quote is rejected and nothing is paid" do
      result = process(event(amount_cents: @quote.final_price_cents - 1))

      assert_not result.processed?
      assert_equal "amount_mismatch", result.reason
      assert_equal 0, Commerce::RoutePurchase.paid.count
    end

    test "a currency, store or mode mismatch is rejected" do
      assert_equal "currency_mismatch", process(event(identity: "e1", currency: "EUR")).reason
      assert_equal "store_mismatch",    process(event(identity: "e2", store_id: "999")).reason
      assert_equal "mode_mismatch",     process(event(identity: "e3", test_mode: false)).reason
      assert_equal 0, Commerce::RoutePurchase.paid.count
    end

    test "a quote belonging to another user is rejected" do
      stranger = Core::User.create!(
        name: "Thief", email: "t-#{SecureRandom.hex(4)}@example.com",
        password: "password123", password_confirmation: "password123",
        email_verified_at: Time.current
      )
      result = process(event(custom_user_id: stranger.id))

      assert_not result.processed?
      assert_equal "ownership_mismatch", result.reason
    end

    test "an unknown route, quote or user is rejected without raising" do
      assert_equal "unknown_route", process(event(identity: "u1", custom_route_id: SecureRandom.uuid)).reason
      assert_equal "unknown_quote", process(event(identity: "u2", custom_quote_id: SecureRandom.uuid)).reason
      assert_equal "unknown_user",  process(event(identity: "u3", custom_user_id: SecureRandom.uuid)).reason
    end

    # FINDING C1 (fix round 1): a real, correctly signed `order_refunded`
    # delivery must never be silently dropped. OrderProcessor claims the event
    # identity BEFORE checking whether it supports the event type, so even an
    # unsupported type leaves a durable, reconciliation-visible row — it is
    # rejected, not merely ignored in memory. (Task 9 will route
    # `order_refunded` to a dedicated RefundProcessor in the controller before
    # OrderProcessor is ever consulted; until then, this is the correct
    # fail-safe behavior.)
    test "an out-of-order refund arriving before the order is durably recorded, not applied" do
      result = Commerce::OrderProcessor.call(
        event: event(identity: "order_refunded:ord_1", name: "order_refunded"), provider_name: "lemon_squeezy"
      )
      assert_not result.processed?
      assert_equal "unsupported_event", result.reason

      stored = Commerce::ProviderEvent.find_by!(event_identity: "order_refunded:ord_1")
      assert_equal "rejected", stored.processing_state
      assert_equal "unsupported_event", stored.rejection_reason
      assert_equal 0, Commerce::RoutePurchase.paid.count
    end

    test "a rejected event is recorded with its reason for reconciliation" do
      process(event(amount_cents: 1))
      stored = Commerce::ProviderEvent.find_by!(event_identity: "order_created:ord_1")
      assert_equal "rejected", stored.processing_state
      assert_equal "amount_mismatch", stored.rejection_reason
    end

    test "a paid order enqueues paid-module generation exactly once" do
      assert_enqueued_with(job: Commerce::PaidModuleGenerationJob) { process }
    end

    # RULING A: a verified event may arrive for a quote whose local purchase
    # write never landed (the provider-side checkout succeeded, but
    # CheckoutCreator's own transaction failed after that). Rejecting it as
    # "unknown_purchase" would take the customer's money and give them
    # nothing. Instead the purchase is recovered from the quote — the same
    # source CheckoutCreator itself would have used — inside the processing
    # transaction, then marked paid.
    test "a verified order for a quote whose local purchase write never landed recovers a paid purchase" do
      route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: @profile, topic: "GCP", locale: "en", status: :active
      )
      LearningRoutesEngine::RouteModule.create!(
        learning_route: route, position: 2, title: "Paid", access_state: :locked, generation_state: :outlined
      )
      quote = build_quote(route: route)

      # No CheckoutCreator call: the quote stays exactly where a failed
      # checkout-creation transaction would have left it — untouched, with no
      # purchase row at all — simulating the provider having created a real
      # checkout while our own write of it was lost.
      assert_equal "unattached", quote.attachment_state
      assert_equal 0, Commerce::RoutePurchase.where(route_quote_id: quote.id).count

      result = process(event(
        identity: "order_created:ord_recover", order_id: "ord_recover", checkout_id: "chk_#{quote.id}",
        amount_cents: quote.final_price_cents, custom_route_id: route.id, custom_quote_id: quote.id
      ))

      assert result.processed?, result.try(:reason)
      purchase = result.purchase.reload
      assert_equal "paid", purchase.state
      assert_equal quote.id, purchase.route_quote_id
      assert_equal route.id, purchase.learning_route_id
      assert_equal @user.id, purchase.user_id
      assert_equal "ord_recover", purchase.provider_order_id
      assert_equal "purchase", quote.reload.attachment_state
      assert Commerce::RoutePurchase.entitled?(route_id: route.id)
    end

    test "a route that already has a paid purchase from a different quote is never re-recovered" do
      other_quote = build_quote(route: @route)
      # Pay off the route through the ordinary pending purchase first.
      process

      result = process(event(
        identity: "order_created:ord_other", order_id: "ord_other", checkout_id: "chk_#{other_quote.id}",
        amount_cents: other_quote.final_price_cents, custom_quote_id: other_quote.id
      ))

      assert_not result.processed?
      assert_equal "already_paid", result.reason
      assert_equal 1, Commerce::RoutePurchase.paid.where(learning_route_id: @route.id).count
      assert_equal "unattached", other_quote.reload.attachment_state
    end
  end

  # A real transactional test wraps `setup` in an uncommitted transaction on the
  # main connection; a second thread borrowing its OWN connection from the pool
  # (as this test must, to exercise two genuinely concurrent database sessions)
  # would not see any of that setup data until it commits. Every other
  # real-connection concurrency test in this codebase
  # (`route_module_concurrency_test.rb`, `promotion_concurrency_test.rb`, …)
  # solves this the same way: a dedicated class with transactional tests turned
  # off and manual, ordered cleanup instead. This class follows that pattern.
  class OrderProcessorConcurrencyTest < ActiveSupport::TestCase
    self.use_transactional_tests = false

    EMAIL_PATTERN = "order-processor-concurrency-%"
    EVENT_IDENTITY = "order_created:ord_concurrent"
    RACE_IDENTITIES = %w[order_created:ord_race_a order_created:ord_race_b].freeze

    setup do
      delete_concurrency_records
      @original_provider_config = Rails.application.config.x.commerce_payment_provider
      Rails.application.config.x.commerce_payment_provider = {
        api_key: "key", signing_secret: "fake_secret", store_id: "1",
        product_id: "2", variant_id: "3", test_mode: true
      }

      @user = Core::User.create!(
        name: "Buyer", email: "order-processor-concurrency-#{SecureRandom.hex(4)}@example.test",
        password: "password123", password_confirmation: "password123",
        email_verified_at: Time.current
      )
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: profile, topic: "AWS Concurrency", locale: "en", status: :active
      )
      LearningRoutesEngine::RouteModule.create!(
        learning_route: @route, position: 2, title: "Paid", access_state: :locked, generation_state: :outlined
      )
      @quote = Commerce::RouteQuote.create_snapshot!(
        user: @user, learning_route: @route, currency: "USD",
        total_module_count: 2, paid_module_count: 1,
        estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40,
        markup_basis_points: Commerce::PricingConstants::MARKUP_BASIS_POINTS,
        minimum_price_per_paid_module_cents: Commerce::PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS,
        cost_based_price_cents: 210, minimum_price_cents: 299, final_price_cents: 299,
        estimator_version: "wp18-v1", provider_rate_versions: { "gpt-5.2" => "2026-08-31" },
        fee_version: "ls-test-v1", image_quality: "medium",
        route_shape_assumptions: { "outline" => [] }, provider_rate_assumptions: { "gpt-5.2" => {} },
        fee_assumptions: { "version" => "ls-test-v1" }, expires_at: 24.hours.from_now
      )
      checkout_result = Commerce::CheckoutCreator.call(
        user: @user, route: @route, adapter: Commerce::Providers::Fake.new,
        success_url: "https://example.test/ok", cancel_url: "https://example.test/no"
      )
      raise "setup failed to create a checkout: #{checkout_result.try(:reason)}" unless checkout_result.created?
    end

    teardown do
      Rails.application.config.x.commerce_payment_provider = @original_provider_config
      delete_concurrency_records
    end

    test "two simultaneous deliveries of one event produce exactly one paid purchase" do
      body_event = Commerce::PaymentProvider::Event.new(
        identity: EVENT_IDENTITY, name: "order_created", test_mode: true,
        store_id: "1", order_id: "ord_concurrent", checkout_id: "chk_#{@quote.id}",
        amount_cents: @quote.final_price_cents, currency: "USD",
        actual_fee_cents: 45, refunded_amount_cents: 0,
        custom_route_id: @route.id, custom_quote_id: @quote.id, custom_user_id: @user.id,
        status: "paid"
      )
      results = []
      threads = 2.times.map do
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            results << Commerce::OrderProcessor.call(event: body_event, provider_name: "lemon_squeezy")
          end
        end
      end
      threads.each(&:join)

      assert_equal 1, results.count(&:processed?)
      assert_equal 1, Commerce::RoutePurchase.paid.where(learning_route_id: @route.id).count
      assert_equal 1, Commerce::ProviderEvent.where(event_identity: body_event.identity).count
    end

    # FINDING I2 (fix round 1): TWO DISTINCT event identities for the SAME
    # route — not a replay of one identity, which the test above already
    # covers. A second, independently valid quote/pending-purchase pair for
    # @route is built so both threads have a real row to move to `paid`; only
    # one can win `idx_route_purchases_single_paid`. Before the fix, the
    # loser's `mark_paid!` raised `ActiveRecord::RecordNotUnique` straight out
    # of `OrderProcessor.call` (an unhandled 500 from the controller, and its
    # ProviderEvent row stuck in "pending" forever). Now it must be caught and
    # resolved as a durable `Rejected(reason: "already_paid")`.
    test "two distinct events for the same route racing produce one paid purchase and no raised errors" do
      second_quote = Commerce::RouteQuote.create_snapshot!(
        user: @user, learning_route: @route, currency: "USD",
        total_module_count: 2, paid_module_count: 1,
        estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40,
        markup_basis_points: Commerce::PricingConstants::MARKUP_BASIS_POINTS,
        minimum_price_per_paid_module_cents: Commerce::PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS,
        cost_based_price_cents: 210, minimum_price_cents: 299, final_price_cents: 299,
        estimator_version: "wp18-v1", provider_rate_versions: { "gpt-5.2" => "2026-08-31" },
        fee_version: "ls-test-v1", image_quality: "medium",
        route_shape_assumptions: { "outline" => [] }, provider_rate_assumptions: { "gpt-5.2" => {} },
        fee_assumptions: { "version" => "ls-test-v1" }, expires_at: 24.hours.from_now
      )
      second_checkout = Commerce::CheckoutCreator.call(
        user: @user, route: @route, adapter: Commerce::Providers::Fake.new,
        success_url: "https://example.test/ok", cancel_url: "https://example.test/no"
      )
      unless second_checkout.created?
        raise "setup failed to create the second checkout: #{second_checkout.try(:reason)}"
      end

      event_a = race_event(identity: RACE_IDENTITIES[0], order_id: "ord_race_a", quote: @quote)
      event_b = race_event(identity: RACE_IDENTITIES[1], order_id: "ord_race_b", quote: second_quote)

      results = []
      threads = [event_a, event_b].map do |body_event|
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            results << Commerce::OrderProcessor.call(event: body_event, provider_name: "lemon_squeezy")
          end
        end
      end
      threads.each(&:join) # re-raises if either call raised — proving neither does

      assert_equal 1, results.count(&:processed?)
      rejected = results.find { |result| result.is_a?(Commerce::OrderProcessor::Rejected) }
      assert_equal "already_paid", rejected.reason
      assert_equal 1, Commerce::RoutePurchase.paid.where(learning_route_id: @route.id).count

      states = Commerce::ProviderEvent.where(event_identity: RACE_IDENTITIES).pluck(:processing_state).sort
      assert_equal %w[processed rejected], states
    end

    private

    def race_event(identity:, order_id:, quote:)
      Commerce::PaymentProvider::Event.new(
        identity: identity, name: "order_created", test_mode: true,
        store_id: "1", order_id: order_id, checkout_id: "chk_#{quote.id}",
        amount_cents: quote.final_price_cents, currency: "USD",
        actual_fee_cents: 45, refunded_amount_cents: 0,
        custom_route_id: @route.id, custom_quote_id: quote.id, custom_user_id: @user.id,
        status: "paid"
      )
    end

    # Deletes only rows this class's own tests could have created (scoped by the
    # unique email pattern and the fixed event identity), in FK-safe order —
    # every commerce FK here is ON DELETE RESTRICT, and the learning route must
    # go before its preview module is touched at all (deleting the route
    # CASCADEs to its modules; deleting a module directly while its route still
    # exists trips `learning_routes_engine_preserve_preview`).
    def delete_concurrency_records
      Commerce::ProviderEvent.where(event_identity: [EVENT_IDENTITY, *RACE_IDENTITIES]).delete_all

      users = Core::User.where("email LIKE ?", EMAIL_PATTERN)
      profiles = LearningRoutesEngine::LearningProfile.where(user_id: users.select(:id))
      routes = LearningRoutesEngine::LearningRoute.where(learning_profile_id: profiles.select(:id))

      Commerce::RoutePurchase.where(learning_route_id: routes.select(:id)).delete_all
      Commerce::RouteQuote.where(learning_route_id: routes.select(:id)).delete_all
      routes.delete_all
      profiles.delete_all
      users.delete_all
    end
  end
end
