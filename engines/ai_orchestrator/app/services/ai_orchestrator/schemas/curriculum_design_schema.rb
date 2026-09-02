# frozen_string_literal: true

module AiOrchestrator
  module Schemas
    # JSON Schema for the `curriculum_design` task, sent to the provider via
    # RubyLLM's `chat.with_schema` so the model is *constrained* to this shape
    # rather than merely asked for it in prose.
    #
    # The shape is transcribed from the OUTPUT FORMAT block already written in
    # config/prompts/curriculum_design.yml (:184-231) — it is not a new contract.
    # Keep the two in sync; the prompt still carries the pedagogy, this only
    # carries the structure.
    #
    # DIVISION OF LABOUR — deliberate:
    #   * This schema enforces SHAPE: which keys exist, their types, and the closed
    #     enums (content_type, delivery_format, level_enum, subject_family).
    #   * CurriculumBrain#validate! (curriculum_brain.rb:124-192) enforces SEMANTICS:
    #     bloom 1-6, estimated_minutes 5-90, 3..24 steps, prerequisites referencing
    #     only earlier steps, first step not an assessment. That validation is good
    #     and stays exactly as it is.
    # The split is not stylistic. OpenAI's strict structured-output mode supports
    # only a subset of JSON Schema and rejects numeric/array bound keywords such as
    # `minimum`, `maximum`, `minItems` and `maxItems`, so those constraints cannot
    # live here even if we wanted them to.
    #
    # STRICT-MODE RULES (RubyLLM sends strict: true by default —
    # ruby_llm-1.11.0/lib/ruby_llm/providers/openai/chat.rb:25):
    #   * every object must set additionalProperties: false
    #   * EVERY property must be listed in `required` — strict mode has no concept
    #     of an optional key, which is why `topics` is required here even though
    #     CurriculumBrain treats it as optional.
    #   * no open-ended maps, which is why `translations` has fixed en/es keys.
    #     That matches config.i18n.available_locales (%i[en es]).
    module CurriculumDesignSchema
      LOCALISED_ROUTE = {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          subject_area: { type: "string" }
        },
        required: %w[title subtitle subject_area],
        additionalProperties: false
      }.freeze

      LOCALISED_STEP = {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" }
        },
        required: %w[title description],
        additionalProperties: false
      }.freeze

      STEP = {
        type: "object",
        properties: {
          label: { type: "string", description: "Step title" },
          description: { type: "string", description: "1-2 sentences on what the student will learn" },
          level: { type: "integer", description: "Internal difficulty scale, 1-5" },
          level_enum: { type: "string", enum: %w[nv1 nv2 nv3] },
          bloom_level: { type: "integer", description: "Bloom's taxonomy level, 1-6" },
          content_type: { type: "string", enum: %w[lesson exercise assessment review] },
          delivery_format: { type: "string", enum: %w[text audio interactive mixed] },
          estimated_minutes: { type: "integer", description: "5-90, and <= session_minutes when provided" },
          prerequisites: {
            type: "array",
            description: "0-based indices of EARLIER steps only. Empty for the first step.",
            items: { type: "integer" }
          },
          exercise_types: {
            type: "array",
            description: "2-4 entries drawn from the controlled vocabulary in the system prompt",
            items: { type: "string" }
          },
          topics: { type: "array", items: { type: "string" } },
          translations: {
            type: "object",
            properties: { en: LOCALISED_STEP, es: LOCALISED_STEP },
            required: %w[en es],
            additionalProperties: false
          }
        },
        required: %w[
          label description level level_enum bloom_level content_type
          delivery_format estimated_minutes prerequisites exercise_types
          topics translations
        ],
        additionalProperties: false
      }.freeze

      MODULE_OUTLINE = {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          translations: {
            type: "object",
            properties: { en: LOCALISED_STEP, es: LOCALISED_STEP },
            required: %w[en es],
            additionalProperties: false
          },
          steps: { type: "array", items: STEP }
        },
        required: %w[title description translations steps],
        additionalProperties: false
      }.freeze

      SCHEMA = {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string", description: "One-line pitch: what the student walks away with" },
          subject_area: { type: "string", description: "e.g. 'Language · Portuguese' or 'Programming · Ruby'" },
          subject_family: { type: "string", enum: %w[language programming design stem business other] },
          translations: {
            type: "object",
            properties: { en: LOCALISED_ROUTE, es: LOCALISED_ROUTE },
            required: %w[en es],
            additionalProperties: false
          },
          modules: { type: "array", items: MODULE_OUTLINE }
        },
        required: %w[title subtitle subject_area subject_family translations modules],
        additionalProperties: false
      }.freeze

      def self.to_json_schema
        { schema: SCHEMA }
      end
    end
  end
end
