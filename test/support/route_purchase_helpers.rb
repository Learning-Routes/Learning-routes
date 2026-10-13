# A real Commerce::RoutePurchase in a chosen state — the same quote and purchase
# the paywall tests build (module_lock_authorization_test.rb:182) — so readability
# tests exercise Commerce::RoutePurchase.entitled? itself, not a stub of it.
module RoutePurchaseHelpers
  def purchase_route!(route, user:, state: :paid)
    quote = Commerce::RouteQuote.create_snapshot!(
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
    purchase = Commerce::RoutePurchase.create!(
      user: user, learning_route: route, route_quote: quote, state: "pending",
      provider: "lemon_squeezy", test_mode: true, amount_cents: 299, currency: "USD",
      estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40
    )
    return purchase if state == :pending

    purchase.mark_paid!(order_id: "ord_#{SecureRandom.hex(3)}", actual_fee_cents: 45, paid_at: Time.current)
    purchase.mark_refunded!(refunded_amount_cents: 299, refunded_at: Time.current) if state == :refunded
    purchase
  end
end
