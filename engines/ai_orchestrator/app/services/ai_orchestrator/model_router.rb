module AiOrchestrator
  class ModelRouter
    ROUTING_TABLE = {
      assessment_questions: { primary: "claude-opus-4-6", fallback: "gpt-5.2" },
      route_generation:     { primary: "gpt-5.2", fallback: "claude-opus-4-6" },
      lesson_content:       { primary: "claude-opus-4-6", fallback: "gpt-5.2" },
      code_generation:      { primary: "gpt-5.2", fallback: "claude-opus-4-6" },
      exam_questions:       { primary: "claude-opus-4-6", fallback: "gpt-5.2" },
      quick_grading:        { primary: "claude-haiku-4-5", fallback: "gpt-5.1-codex-mini" },
      voice_narration:      { primary: "elevenlabs", fallback: nil },
      image_generation:     { primary: "nanobanana-pro", fallback: "nanobanana-flash" },
      quick_images:         { primary: "nanobanana-flash", fallback: "nanobanana-pro" }
    }.freeze

    def self.model_for(task_type)
      config = AiModelConfig.primary_model_for(task_type.to_s)
      return config.model_name if config

      # Fall back to hardcoded routing table
      route = ROUTING_TABLE[task_type.to_sym]
      raise ArgumentError, "Unknown task type: #{task_type}" unless route
      route[:primary]
    end

    def self.fallback_for(task_type)
      config = AiModelConfig.fallback_model_for(task_type.to_s)
      return config.model_name if config

      route = ROUTING_TABLE[task_type.to_sym]
      route&.dig(:fallback)
    end
  end
end
