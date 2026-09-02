# frozen_string_literal: true

module Commerce
  class LemonSqueezyFeeEstimator
    Result = Data.define(:marked_up_cost_cents, :gross_cents, :fee_cents)

    def self.call(ai_cost_microcents:, percentage_basis_points:, fixed_cents:)
      unless ai_cost_microcents.is_a?(Integer) && ai_cost_microcents >= 0 &&
          percentage_basis_points.is_a?(Integer) &&
          percentage_basis_points.between?(0, PricingConstants::BASIS_POINTS_SCALE - 1) &&
          fixed_cents.is_a?(Integer) && fixed_cents >= 0
        raise ArgumentError, "fee estimation requires non-negative integer configuration"
      end

      marked_up = PricingConstants.apply_markup(ai_cost_microcents)
      gross = Rational(
        (marked_up + fixed_cents) * PricingConstants::BASIS_POINTS_SCALE,
        PricingConstants::BASIS_POINTS_SCALE - percentage_basis_points
      ).ceil
      fee = Rational(gross * percentage_basis_points, PricingConstants::BASIS_POINTS_SCALE).ceil + fixed_cents
      Result.new(marked_up_cost_cents: marked_up, gross_cents: gross, fee_cents: fee)
    end
  end
end
