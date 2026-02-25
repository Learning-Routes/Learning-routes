module AiOrchestrator
  class ModelRouter
    ROUTING_TABLE = {
      assessment_questions: { primary: "gpt-5.2", fallback: "gpt-5.1-codex-mini" },
      route_generation:     { primary: "gpt-5.2", fallback: "gpt-5.1-codex-mini" },
      lesson_content:       { primary: "gpt-5.2", fallback: "gpt-5.1-codex-mini" },
      code_generation:      { primary: "gpt-5.2", fallback: "gpt-5.1-codex-mini" },
      exam_questions:       { primary: "gpt-5.2", fallback: "gpt-5.1-codex-mini" },
      quick_grading:        { primary: "gpt-5.1-codex-mini", fallback: "gpt-5.2" },
      voice_narration:      { primary: "gpt-5.1-codex-mini", fallback: "gpt-5.2" },
      voice_evaluation:     { primary: "gpt-5.1-codex-mini", fallback: "gpt-5.2" },
      image_generation:     { primary: "nanobanana-pro", fallback: "nanobanana-flash" },
      quick_images:         { primary: "nanobanana-flash", fallback: "nanobanana-pro" },
      gap_analysis:         { primary: "gpt-5.2", fallback: "gpt-5.1-codex-mini" },
      reinforcement_generation: { primary: "gpt-5.2", fallback: "gpt-5.1-codex-mini" },
      explain_differently:       { primary: "gpt-5.2", fallback: "gpt-5.1-codex-mini" },
      give_example:              { primary: "gpt-5.2", fallback: "gpt-5.1-codex-mini" },
      simplify_content:          { primary: "gpt-5.1-codex-mini", fallback: "gpt-5.2" },
      exercise_hint:             { primary: "gpt-5.1-codex-mini", fallback: "gpt-5.2" },
      step_quiz:                 { primary: "gpt-5.1-codex-mini", fallback: "gpt-5.2" }
    }.freeze

    # Per-model rate limits (requests per minute)
    RATE_LIMITS = {
      "gpt-5.2"            => 60,
      "gpt-5.1-codex-mini" => 120,
      "claude-opus-4-5"    => 40,
      "claude-haiku-4-5"   => 200,
      "claude-sonnet-4-5"  => 80,
      "elevenlabs"         => 20,
      "nanobanana-pro"     => 30,
      "nanobanana-flash"   => 60
    }.freeze

    class RateLimitExceeded < StandardError; end
    class AllModelsUnavailable < StandardError; end

    def initialize(task_type:, user: nil)
      @task_type = task_type.to_sym
      @user = user
    end

    # Execute a request with automatic fallback
    def execute(&block)
      primary = model_for(@task_type)
      check_rate_limit!(primary)
      check_cost_limit!

      begin
        yield primary, model_params(primary)
      rescue => e
        Rails.logger.warn("[AiOrchestrator::ModelRouter] Primary model #{primary} failed: #{e.message}")
        fallback = fallback_for(@task_type)
        raise AllModelsUnavailable, "Primary model #{primary} failed and no fallback available" unless fallback

        check_rate_limit!(fallback)
        begin
          yield fallback, model_params(fallback)
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

    def check_rate_limit!(model_name)
      limit = rate_limit_for(model_name)
      return unless limit

      key = "ai_rate_limit:#{model_name}"
      current = Rails.cache.read(key).to_i

      if current >= limit
        raise RateLimitExceeded, "Rate limit exceeded for #{model_name}: #{current}/#{limit} rpm"
      end

      # Atomic increment; initialize to 1 if key doesn't exist yet
      if Rails.cache.respond_to?(:increment)
        Rails.cache.write(key, 0, expires_in: 1.minute) unless Rails.cache.read(key)
        Rails.cache.increment(key)
      else
        Rails.cache.write(key, current + 1, expires_in: 1.minute)
      end
    end

    def rate_limit_for(model_name)
      db_config = AiModelConfig.enabled.find_by(model_name: model_name, task_type: @task_type.to_s)
      db_config&.rate_limit || RATE_LIMITS[model_name]
    end

    def check_cost_limit!
      alerts = Rails.application.config.ai_cost_alerts

      daily = CostTracker.daily_cost
      if daily >= alerts[:daily_limit]
        raise RateLimitExceeded, "Daily cost limit exceeded: #{daily} cents (limit: #{alerts[:daily_limit]})"
      end

      if @user
        user_daily = CostTracker.cost_by_user(user_id: @user.id, period: Date.current.all_day)
        if user_daily >= alerts[:per_user_daily]
          raise RateLimitExceeded, "Per-user daily cost limit exceeded for user #{@user.id}"
        end
      end
    end
  end
end
