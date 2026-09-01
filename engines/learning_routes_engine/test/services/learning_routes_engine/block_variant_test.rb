require "test_helper"

# WP-15 §B. The permutation has to be a *function*, not a random draw: the same student
# on the same attempt must see the same board on a reload, and a different one after a
# failure. These tests pin exactly that.
class LearningRoutesEngine::BlockVariantTest < ActiveSupport::TestCase
  BV = LearningRoutesEngine::BlockVariant

  def variant(user: "u1", step: "s1", section_index: 0, attempt_number: 0)
    BV.for(user: user, route_step: step, section_index: section_index, attempt_number: attempt_number)
  end

  # ── Determinism ─────────────────────────────────────────────────────────

  test "the same seed returns the same permutation, every time" do
    a = variant.order(8, salt: "terms")
    5.times { assert_equal a, variant.order(8, salt: "terms") }
  end

  test "a different attempt_number returns a different permutation" do
    before = variant(attempt_number: 0).order(8, salt: "terms")
    after  = variant(attempt_number: 1).order(8, salt: "terms")

    assert_not_equal before, after
    assert_equal before.sort, after.sort, "both must still be permutations of the same set"
  end

  test "a different student returns a different permutation" do
    assert_not_equal variant(user: "u1").order(8, salt: "terms"),
                     variant(user: "u2").order(8, salt: "terms")
  end

  test "a different step returns a different permutation" do
    assert_not_equal variant(step: "s1").order(8, salt: "terms"),
                     variant(step: "s2").order(8, salt: "terms")
  end

  test "a different section of the same step returns a different permutation" do
    assert_not_equal variant(section_index: 0).order(8, salt: "terms"),
                     variant(section_index: 1).order(8, salt: "terms")
  end

  # This is the one that makes the service reusable, and the one that keeps drag_drop
  # honest: if both columns moved together, "the one beside it" would still be the
  # answer even though the board looks shuffled.
  test "two salts on the same seed permute independently" do
    v = variant
    assert_not_equal v.order(8, salt: "terms"), v.order(8, salt: "definitions")
  end

  test "a record and its id seed identically" do
    record = Struct.new(:id).new("abc")
    assert_equal BV.for(user: "abc", section_index: 0).order(6),
                 BV.for(user: record, section_index: 0).order(6)
  end

  # ── It is a permutation, not a sample ───────────────────────────────────

  test "order returns every index exactly once" do
    assert_equal (0...11).to_a, variant.order(11, salt: "x").sort
  end

  test "order handles the degenerate sizes without raising" do
    assert_equal [], variant.order(0)
    assert_equal [], variant.order(-3)
    assert_equal [0], variant.order(1)
  end

  test "permute keeps each element paired with its ORIGINAL index" do
    items = %w[a b c d e f g]
    permuted = variant.permute(items, salt: "terms")

    assert_equal items.size, permuted.size
    permuted.each { |original_index, element| assert_equal items[original_index], element }
    assert_equal items.sort, permuted.map(&:last).sort
  end

  test "permute of a large enough set actually reorders it" do
    items = (1..12).to_a
    assert_not_equal items, variant.permute(items, salt: "terms").map(&:last)
  end

  test "permute tolerates nil" do
    assert_equal [], variant.permute(nil, salt: "terms")
  end

  # ── The no-user context (preview, agent reply) ──────────────────────────

  test "a nil user and a nil step never raise and stay deterministic" do
    anon = BV.for(user: nil, route_step: nil, section_index: 2)

    assert_equal 6, anon.order(6).size
    assert_equal anon.order(6), BV.for(user: nil, route_step: nil, section_index: 2).order(6)
  end

  test "a nil user is not the same seed as a user whose id is the empty string" do
    # Guards the separator: parts are joined, so adjacent parts must not run together.
    assert_not_equal BV.for(user: nil, route_step: "ab", section_index: 0).order(9),
                     BV.for(user: "a", route_step: "b", section_index: 0).order(9)
  end

  test "the first render, before any BlockAttempt row exists, seeds at attempt zero" do
    assert_equal variant(attempt_number: 0).order(8, salt: "terms"),
                 BV.for(user: "u1", route_step: "s1", section_index: 0).order(8, salt: "terms")
  end
end
