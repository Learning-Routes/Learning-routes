# frozen_string_literal: true

module Commerce
  # The approved pricing constants, defined exactly once.
  #
  # These were duplicated across RouteQuoteBuilder, RouteQuote and (implicitly)
  # LemonSqueezyFeeEstimator, which baked the 50% markup in as a literal 3/2. A
  # quote therefore SNAPSHOTTED markup_basis_points: 5000 while the arithmetic
  # ignored it: changing the constant would have made every snapshot lie without
  # moving a single price. The multiplier is now derived from the constant.
  module PricingConstants
    BASIS_POINTS_SCALE = 10_000

    # 50% markup over estimated full-route AI cost (spec: "Quotes").
    MARKUP_BASIS_POINTS = 5000

    # USD 2.99 per paid module (spec: "Quotes").
    MINIMUM_PRICE_PER_PAID_MODULE_CENTS = 299

    # Marked-up AI cost, in whole cents, rounded UP so a fraction of a cent is
    # never absorbed by us. Exact integer arithmetic via Rational; no Float.
    def self.apply_markup(microcents)
      unless microcents.is_a?(Integer) && microcents >= 0
        raise ArgumentError, "markup requires a non-negative integer microcent amount"
      end

      multiplier = BASIS_POINTS_SCALE + MARKUP_BASIS_POINTS
      Rational(
        microcents * multiplier,
        BASIS_POINTS_SCALE * AiOrchestrator::CostTracker::MICROCENTS_PER_CENT
      ).ceil
    end
  end
end
