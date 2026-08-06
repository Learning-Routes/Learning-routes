# frozen_string_literal: true

module AiOrchestrator
  # Maps a task_type to the JSON Schema that constrains its response.
  #
  # 12 prompt templates declare `response_format: json`, but AiClient stripped that
  # key before every call (`.except(:response_format)`), so JSON mode was never
  # switched on and the model was only ever *asked* in prose to return JSON. A task
  # registered here is sent with a real provider-side schema instead.
  #
  # Registering a task type is a behaviour change, not a formality: the provider
  # will then reject any response that does not fit, so the schema must actually
  # match what the prompt asks for and what the consumer expects. Add task types
  # one at a time, with a conformance test, rather than in a batch.
  #
  # Task types NOT registered here keep the previous behaviour (prose-instructed
  # JSON, parsed by ResponseParser). That is intentional for anything returning
  # prose or markdown — lesson_content, tutor_reply, explain_differently and the
  # rest emit narrative bodies with embedded code fences, which a strict object
  # schema would fight rather than help.
  module SchemaRegistry
    SCHEMAS = {
      "curriculum_design" => Schemas::CurriculumDesignSchema
    }.freeze

    def self.for(task_type)
      SCHEMAS[task_type.to_s]
    end

    def self.registered?(task_type)
      SCHEMAS.key?(task_type.to_s)
    end
  end
end
