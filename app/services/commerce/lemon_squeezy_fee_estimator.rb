# frozen_string_literal: true

module Commerce
  class LemonSqueezyFeeEstimator
    Result = Data.define(:marked_up_cost_cents, :gross_cents, :fee_cents)

    def self.call(ai_cost_microcents:, percentage_basis_points:, fixed_cents:)
      unless ai_cost_microcents.is_a?(Integer) && ai_cost_microcents >= 0 &&
          percentage_basis_points.is_a?(Integer) && percentage_basis_points.between?(0, 9_999) &&
          fixed_cents.is_a?(Integer) && fixed_cents >= 0
        raise ArgumentError, "fee estimation requires non-negative integer configuration"
      end

      marked_up = Rational(ai_cost_microcents * 3, 2 * AiOrchestrator::CostTracker::MICROCENTS_PER_CENT).ceil
      gross = Rational((marked_up + fixed_cents) * 10_000, 10_000 - percentage_basis_points).ceil
      fee = Rational(gross * percentage_basis_points, 10_000).ceil + fixed_cents
      Result.new(marked_up_cost_cents: marked_up, gross_cents: gross, fee_cents: fee)
    end
  end
end
