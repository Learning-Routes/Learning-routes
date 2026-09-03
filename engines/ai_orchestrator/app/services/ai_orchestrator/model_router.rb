module AiOrchestrator
  class ModelRouter
    ROUTING_TABLE = {
      assessment_questions: { primary: "gpt-5.2", fallback: "gpt-4.1-mini" },
      route_generation:     { primary: "gpt-5.2", fallback: "gpt-4.1-mini" },
      # Curriculum design is structural JSON (not prose) — mini is faster/cheaper
      # and reliably produces JSON. Falls back to the primary model if mini fails.
      curriculum_design:    { primary: "gpt-4.1-mini", fallback: "gpt-5.2" },
      lesson_content:       { primary: "gpt-5.2", fallback: "gpt-4.1-mini" },
      code_generation:      { primary: "gpt-5.2", fallback: "gpt-4.1-mini" },
      exam_questions:       { primary: "gpt-5.2", fallback: "gpt-4.1-mini" },
      quick_grading:        { primary: "gpt-4.1-mini", fallback: "gpt-5.2" },
      voice_narration:      { primary: "gpt-4.1-mini", fallback: "gpt-5.2" },
      voice_evaluation:     { primary: "gpt-4.1-mini", fallback: "gpt-5.2" },
      image_generation:     { primary: "gpt-image-1", fallback: "gpt-image-1" },
      quick_images:         { primary: "gpt-image-1", fallback: "gpt-image-1" },
      gap_analysis:         { primary: "gpt-5.2", fallback: "gpt-4.1-mini" },
      reinforcement_generation: { primary: "gpt-5.2", fallback: "gpt-4.1-mini" },
      explain_differently:       { primary: "gpt-5.2", fallback: "gpt-4.1-mini" },
      give_example:              { primary: "gpt-5.2", fallback: "gpt-4.1-mini" },
      simplify_content:          { primary: "gpt-4.1-mini", fallback: "gpt-5.2" },
      exercise_hint:             { primary: "gpt-4.1-mini", fallback: "gpt-5.2" },
      step_quiz:                 { primary: "gpt-4.1-mini", fallback: "gpt-5.2" },
      tutor_reply:               { primary: "gpt-4.1-mini", fallback: "gpt-5.2" },
      content_agent:             { primary: "gpt-5.2", fallback: "gpt-4.1-mini" }
    }.freeze

    # Per-model rate limits (requests per minute)
    RATE_LIMITS = {
      "gpt-5.2"            => 60,
      "gpt-4.1-mini" => 120,
      "claude-opus-4-5"    => 40,
      "claude-haiku-4-5"   => 200,
      "claude-sonnet-4-5"  => 80,
      "elevenlabs"         => 20,
      "gpt-image-1"        => 30
    }.freeze

    # Kept as an alias so existing `rescue ModelRouter::RateLimitExceeded`
    # call sites (AiRequestJob) still catch the refusal now that SpendGuard
    # owns it.
    RateLimitExceeded = SpendGuard::LimitExceeded
    class AllModelsUnavailable < StandardError; end

    def initialize(task_type:, user: nil)
      @task_type = task_type.to_sym
      @user = user
    end

    # Execute a request with automatic fallback
    def execute(&block)
      primary = model_for(@task_type)

      begin
        yield primary, model_params(primary)
      rescue SpendGuard::LimitExceeded
        # A ceiling refusing to spend is NOT a model failure. Falling back would
        # ask the same guard the same question about a different model, burn a
        # second rate-limit slot, and convert a clear "we declined to spend" into
        # AllModelsUnavailable. The block's AiClient already consulted the guard;
        # let the refusal out untouched.
        raise
      rescue => e
        Rails.logger.warn("[AiOrchestrator::ModelRouter] Primary model #{primary} failed: #{e.message}")
        fallback = fallback_for(@task_type)
        raise AllModelsUnavailable, "Primary model #{primary} failed and no fallback available" unless fallback

        begin
          # No check here either: the block builds an AiClient for `fallback`,
          # and that client asks SpendGuard about the model it is ACTUALLY going
          # to call. The old code checked the rate limit for a model name it only
          # hoped the block would use.
          yield fallback, model_params(fallback)
        rescue SpendGuard::LimitExceeded
          raise
        rescue => e
          raise AllModelsUnavailable, "Both primary (#{primary}) and fallback (#{fallback}) failed: #{e.message}"
        end
      end
    end

    def self.model_for(task_type)
      new(task_type: task_type).model_for(task_type)
    end

    def self.fallback_for(task_type)
      new(task_type: task_type).fallback_for(task_type)
    end

    def model_for(task_type)
      task = task_type.to_sym
      config = AiModelConfig.primary_model_for(task.to_s)
      return config.model_name if config

      route = ROUTING_TABLE[task]
      raise ArgumentError, "Unknown task type: #{task}" unless route
      route[:primary]
    end

    def fallback_for(task_type)
      task = task_type.to_sym
      config = AiModelConfig.fallback_model_for(task.to_s)
      return config.model_name if config

      route = ROUTING_TABLE[task]
      route&.dig(:fallback)
    end

    private

    def model_params(model_name)
      defaults = Rails.application.config.ai_model_defaults[@task_type] || {}
      db_config = AiModelConfig.enabled.find_by(model_name: model_name, task_type: @task_type.to_s)
      defaults.merge(db_config&.settings || {})
    end
  end
end
