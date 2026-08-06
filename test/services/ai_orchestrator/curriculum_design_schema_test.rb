require "test_helper"

# The schema is sent to OpenAI in STRICT mode (RubyLLM defaults strict: true —
# ruby_llm-1.11.0/lib/ruby_llm/providers/openai/chat.rb:25). Strict mode has
# non-obvious rules, and violating them is a 400 from the provider at runtime, not
# a Ruby error — so it would only ever be caught in production. These tests encode
# the rules structurally.
class AiOrchestrator::CurriculumDesignSchemaTest < ActiveSupport::TestCase
  SCHEMA = AiOrchestrator::Schemas::CurriculumDesignSchema::SCHEMA

  # Walk every object node in the schema.
  def each_object(node, path = "root", &blk)
    return unless node.is_a?(Hash)

    blk.call(node, path) if node[:type] == "object"
    node[:properties]&.each { |name, child| each_object(child, "#{path}.#{name}", &blk) }
    each_object(node[:items], "#{path}[]", &blk) if node[:items]
  end

  test "every object forbids additional properties" do
    each_object(SCHEMA) do |node, path|
      assert_equal false, node[:additionalProperties],
        "#{path} must set additionalProperties: false — OpenAI strict mode rejects the schema otherwise"
    end
  end

  test "every object marks all of its properties required" do
    # Strict mode has no optional keys: `required` must list every property.
    each_object(SCHEMA) do |node, path|
      declared = node[:properties].keys.map(&:to_s).sort
      required = Array(node[:required]).map(&:to_s).sort

      assert_equal declared, required,
        "#{path}: strict mode requires `required` to list every property. " \
        "Declared #{declared.inspect}, required #{required.inspect}"
    end
  end

  test "no unsupported validation keywords are used" do
    # OpenAI strict mode rejects these; the equivalent constraints live in
    # CurriculumBrain#validate! instead, which is where they belong anyway.
    unsupported = %i[minimum maximum minItems maxItems minLength maxLength pattern]
    found = []

    walk = lambda do |node, path|
      return unless node.is_a?(Hash)

      (node.keys & unsupported).each { |k| found << "#{path}.#{k}" }
      node[:properties]&.each { |name, child| walk.call(child, "#{path}.#{name}") }
      walk.call(node[:items], "#{path}[]") if node[:items]
    end
    walk.call(SCHEMA, "root")

    assert_equal [], found, "unsupported strict-mode keywords: #{found.inspect}"
  end

  test "the schema covers everything CurriculumBrain requires" do
    # If these drift apart, the model returns a payload that validates against the
    # schema and is then thrown away by CurriculumBrain — a silent template fallback,
    # which is precisely the failure this package exists to remove.
    route_keys = SCHEMA[:properties].keys.map(&:to_s)
    assert_equal [], AiOrchestrator::CurriculumBrain::REQUIRED_ROUTE_KEYS - route_keys

    step_keys = SCHEMA[:properties][:steps][:items][:properties].keys.map(&:to_s)
    assert_equal [], AiOrchestrator::CurriculumBrain::REQUIRED_STEP_KEYS - step_keys
  end

  test "closed enums match the values CurriculumBrain accepts" do
    step = SCHEMA[:properties][:steps][:items][:properties]

    assert_equal AiOrchestrator::CurriculumBrain::ALLOWED_CONTENT_TYPES.sort,
                 step[:content_type][:enum].sort
    assert_equal AiOrchestrator::CurriculumBrain::ALLOWED_DELIVERY_FORMATS.sort,
                 step[:delivery_format][:enum].sort
    assert_equal AiOrchestrator::CurriculumBrain::ALLOWED_LEVEL_ENUMS.sort,
                 step[:level_enum][:enum].sort
    assert_equal AiOrchestrator::CurriculumBrain::ALLOWED_SUBJECT_FAMILIES.sort,
                 SCHEMA[:properties][:subject_family][:enum].sort
  end

  test "translations expose exactly the app's available locales" do
    expected = I18n.available_locales.map(&:to_s).sort

    assert_equal expected, SCHEMA[:properties][:translations][:properties].keys.map(&:to_s).sort
    step_translations = SCHEMA[:properties][:steps][:items][:properties][:translations]
    assert_equal expected, step_translations[:properties].keys.map(&:to_s).sort
  end

  test "the registry exposes the schema for curriculum_design only" do
    assert AiOrchestrator::SchemaRegistry.registered?("curriculum_design")
    assert_equal AiOrchestrator::Schemas::CurriculumDesignSchema,
                 AiOrchestrator::SchemaRegistry.for("curriculum_design")

    # Prose-producing tasks must NOT be schema-constrained.
    refute AiOrchestrator::SchemaRegistry.registered?("lesson_content")
    refute AiOrchestrator::SchemaRegistry.registered?("tutor_reply")
  end

  test "RubyLLM accepts the schema and renders it as an OpenAI json_schema payload" do
    # Building a Chat needs a configured provider even though nothing is sent.
    # Same dummy-key pattern as content_agent_test.rb:11-16.
    original = RubyLLM.config.openai_api_key
    RubyLLM.config.openai_api_key = "test-key"

    chat = RubyLLM.chat(model: "gpt-4.1-mini")
    chat.with_schema(AiOrchestrator::Schemas::CurriculumDesignSchema)

    assert_equal SCHEMA, chat.schema,
      "with_schema should unwrap to_json_schema[:schema] and store it verbatim"
  ensure
    RubyLLM.config.openai_api_key = original
  end
end
