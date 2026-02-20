module AiOrchestrator
  class CacheService
    # Cache TTLs per task type
    CACHE_TTLS = {
      "assessment_questions" => 1.hour,
      "route_generation"     => 24.hours,
      "lesson_content"       => 24.hours,
      "code_generation"      => 12.hours,
      "exam_questions"       => 1.hour,
      "quick_grading"        => 0,          # Never cache grading
      "voice_narration"      => 7.days,
      "image_generation"     => 7.days,
      "quick_images"         => 7.days,
      "gap_analysis"         => 0,          # Never cache gap analysis
      "reinforcement_generation" => 1.hour,
      "explain_differently"       => 12.hours,
      "give_example"              => 12.hours,
      "simplify_content"          => 12.hours,
      "exercise_hint"             => 0,
      "step_quiz"                 => 2.hours
    }.freeze

    # Tasks that should never be cached
    NON_CACHEABLE = %w[quick_grading gap_analysis exercise_hint].freeze

    def self.fetch(task_type:, prompt:, model:)
      return nil if NON_CACHEABLE.include?(task_type.to_s)

      key = cache_key(task_type: task_type, prompt: prompt, model: model)
      cached = Rails.cache.read(key)

      if cached
        Rails.logger.debug("[AiOrchestrator::CacheService] Cache hit for #{task_type}: #{key}")
      end

      cached
    end

    def self.store(task_type:, prompt:, model:, response:)
      return if NON_CACHEABLE.include?(task_type.to_s)

      ttl = CACHE_TTLS[task_type.to_s] || 1.hour
      return if ttl.zero?

      key = cache_key(task_type: task_type, prompt: prompt, model: model)

      Rails.cache.write(key, { content: response, cached_at: Time.current }, expires_in: ttl)
      Rails.logger.debug("[AiOrchestrator::CacheService] Cached response for #{task_type}: #{key}")
    end

    def self.invalidate(task_type:, prompt:, model:)
      key = cache_key(task_type: task_type, prompt: prompt, model: model)
      Rails.cache.delete(key)
    end

    def self.invalidate_all_for_task(task_type:)
      # With Solid Cache, we can't easily pattern-delete, so this is a no-op placeholder.
      # In production, consider using tagged cache entries or a cache versioning strategy.
      Rails.logger.info("[AiOrchestrator::CacheService] Invalidate all for #{task_type} requested (manual)")
    end

    def self.cache_key(task_type:, prompt:, model:)
      digest = Digest::SHA256.hexdigest("#{task_type}:#{model}:#{prompt.to_s.strip}")
      "ai_orchestrator:#{task_type}:#{digest}"
    end
  end
end
