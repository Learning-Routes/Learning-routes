require "test_helper"

# Guards the registries that must agree with each other.
#
# These are the tests that matter most in this package. The /routes/create product
# failure was not a logic bug — it was two lists disagreeing, with a rescue in
# between that hid the consequence. Logic bugs show up in behaviour; registry drift
# does not, which is why it survived for months.
class AiOrchestrator::AiModelConfigTest < ActiveSupport::TestCase
  TASK_TYPES = AiOrchestrator::AiModelConfig::TASK_TYPES
  ROUTING_TABLE = AiOrchestrator::ModelRouter::ROUTING_TABLE
  SUPPORTED_MODELS = AiOrchestrator::AiInteraction::SUPPORTED_MODELS
  PRICING = AiOrchestrator::CostTracker::PRICING

  test "every routed task type is a valid AiInteraction task_type" do
    missing = ROUTING_TABLE.keys.map(&:to_s) - TASK_TYPES

    assert_equal [], missing,
      "ModelRouter routes #{missing.inspect} but AiInteraction validates task_type " \
      "against AiModelConfig::TASK_TYPES, so Orchestrate.call raises RecordInvalid " \
      "for these and the caller silently falls back. Add them to TASK_TYPES."
  end

  test "every model ModelRouter can select is a valid AiInteraction model" do
    routed = ROUTING_TABLE.values.flat_map { |r| [r[:primary], r[:fallback]] }.compact.uniq
    missing = routed - SUPPORTED_MODELS

    assert_equal [], missing,
      "ModelRouter can select #{missing.inspect}, but AiInteraction validates model " \
      "against SUPPORTED_MODELS. Selecting one of these raises RecordInvalid at the " \
      "point of recording the call — the same failure mode as an unregistered task type."
  end

  test "every routable model has a price" do
    routed = ROUTING_TABLE.values.flat_map { |r| [r[:primary], r[:fallback]] }.compact.uniq
    unpriced = routed - PRICING.keys

    assert_equal [], unpriced,
      "CostTracker::PRICING has no entry for #{unpriced.inspect}, so estimate_cost " \
      "returns 0 and every spend cap and alert treats these calls as free."
  end

  test "every task type is a well-formed identifier" do
    # %w[] has no comment syntax: a `#` inside the literal is parsed as a word, so a
    # comment added between the brackets silently becomes ~60 bogus task types. That
    # happened while writing this package, and none of the subset assertions above
    # noticed, because junk entries only ever make the superset bigger.
    malformed = TASK_TYPES.reject { |t| t.match?(/\A[a-z][a-z0-9_]*\z/) }

    assert_equal [], malformed,
      "TASK_TYPES contains non-identifier entries: #{malformed.inspect}"
  end

  test "task types are unique" do
    assert_equal TASK_TYPES.uniq, TASK_TYPES
  end

  test "curriculum_design specifically is registered" do
    # Called out on its own because this is the one that broke the product: without
    # it, 100% of generated routes were the hardcoded 8-step fallback template.
    assert_includes TASK_TYPES, "curriculum_design"
    assert ROUTING_TABLE.key?(:curriculum_design)
  end

  test "an AiInteraction can actually be created for every routed task type" do
    # The end-to-end assertion the three above only imply. Orchestrate.call does
    # exactly this, so if it fails here it fails in production.
    ROUTING_TABLE.each_key do |task_type|
      model = AiOrchestrator::ModelRouter.model_for(task_type)
      interaction = AiOrchestrator::AiInteraction.new(
        model: model, task_type: task_type.to_s, prompt: "x", status: :pending
      )

      assert interaction.valid?,
        "task_type=#{task_type} model=#{model} => #{interaction.errors.full_messages.join('; ')}"
    end
  end
end
