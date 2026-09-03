require "test_helper"

class Commerce::PricingConstantsTest < ActiveSupport::TestCase
  PC = Commerce::PricingConstants

  test "the approved constants are exactly the spec values" do
    assert_equal 5000, PC::MARKUP_BASIS_POINTS
    assert_equal 299, PC::MINIMUM_PRICE_PER_PAID_MODULE_CENTS
    assert_equal 10_000, PC::BASIS_POINTS_SCALE
  end

  # The whole point of the extraction: the constant must DRIVE the arithmetic,
  # not merely be snapshotted beside it.
  test "apply_markup derives the multiplier from MARKUP_BASIS_POINTS" do
    # 1_000_000 microcents = 100 cents; +50% = 150 cents.
    assert_equal 150, PC.apply_markup(1_000_000)
  end

  test "apply_markup ceilings rather than truncating" do
    # 1 microcent marked up is 1.5 microcents = 0.00015 cents -> ceil -> 1 cent.
    assert_equal 1, PC.apply_markup(1)
    assert_equal 0, PC.apply_markup(0)
  end

  test "apply_markup never produces a Float" do
    assert_kind_of Integer, PC.apply_markup(123_456_789)
  end

  test "apply_markup rejects negative and non-integer input" do
    assert_raises(ArgumentError) { PC.apply_markup(-1) }
    assert_raises(ArgumentError) { PC.apply_markup(1.5) }
  end
end
