require "test_helper"

module Commerce
  class LemonSqueezyFeeEstimatorTest < ActiveSupport::TestCase
    test "grosses up marked-up cost once with exact closed-form arithmetic" do
      result = LemonSqueezyFeeEstimator.call(
        ai_cost_microcents: 1_000_000,
        percentage_basis_points: 500,
        fixed_cents: 50
      )

      # $1 AI cost -> $1.50 after markup; ceil(($1.50 + $0.50) / 0.95) = $2.11.
      assert_equal 150, result.marked_up_cost_cents
      assert_equal 211, result.gross_cents
      assert_equal 61, result.fee_cents
      assert_operator result.gross_cents - result.fee_cents, :>=, result.marked_up_cost_cents
    end

    test "rounds the markup and gross-up upward at cent boundaries" do
      result = LemonSqueezyFeeEstimator.call(
        ai_cost_microcents: 10_001,
        percentage_basis_points: 1,
        fixed_cents: 0
      )

      assert_equal 2, result.marked_up_cost_cents
      assert_equal 3, result.gross_cents
      assert_equal 1, result.fee_cents
    end

    test "does not recursively approximate provider fees" do
      first = LemonSqueezyFeeEstimator.call(
        ai_cost_microcents: 2_345_678, percentage_basis_points: 725, fixed_cents: 30
      )
      second = LemonSqueezyFeeEstimator.call(
        ai_cost_microcents: 2_345_678, percentage_basis_points: 725, fixed_cents: 30
      )

      assert_equal first, second
    end

    test "rejects invalid percentages and fixed fees" do
      assert_raises(ArgumentError) do
        LemonSqueezyFeeEstimator.call(ai_cost_microcents: 1, percentage_basis_points: 10_000, fixed_cents: 0)
      end
      assert_raises(ArgumentError) do
        LemonSqueezyFeeEstimator.call(ai_cost_microcents: 1, percentage_basis_points: 0, fixed_cents: -1)
      end
    end
  end
end
