module AiOrchestrator
  # CurriculumBrain — the "thinking" step that designs the STRUCTURE of a learning
  # route before any content is generated. Consumes a RouteRequest + user profile
  # and returns a route-shape hash that WizardRouteGenerationJob can consume
  # directly as a drop-in replacement for `generate_fallback_route`.
  #
  # The hard part of a good curriculum is not topic coverage — it's pedagogy:
  # Bloom's progression, prereq graph, cadence of review/assessment steps,
  # per-step exercise type selection that matches the subject family (language
  # vs programming vs design). This service delegates that thinking to the LLM
  # via a detailed prompt template (config/prompts/curriculum_design.yml) and
  # validates the response before handing it downstream.
  #
  # Fails open: on any parse/validation error, logs and returns nil so the
  # caller can fall back to the deterministic template path without crashing.
  class CurriculumBrain
    class InvalidStructureError < StandardError; end

    REQUIRED_ROUTE_KEYS = %w[title subtitle subject_area subject_family translations steps].freeze
    REQUIRED_STEP_KEYS = %w[label description level level_enum bloom_level content_type delivery_format estimated_minutes prerequisites exercise_types translations].freeze
    ALLOWED_CONTENT_TYPES = %w[lesson exercise assessment review].freeze
    ALLOWED_DELIVERY_FORMATS = %w[text audio interactive mixed].freeze
    ALLOWED_LEVEL_ENUMS = %w[nv1 nv2 nv3].freeze
    ALLOWED_SUBJECT_FAMILIES = %w[language programming design stem business other].freeze

    def self.design(route_request:, user:, content_locale:, target_locale: nil)
      new(route_request: route_request, user: user, content_locale: content_locale, target_locale: target_locale).design
    end

    def initialize(route_request:, user:, content_locale:, target_locale: nil)
      @request = route_request
      @user = user
      @content_locale = content_locale
      @target_locale = target_locale.presence
      # Look up the profile via its own query rather than user.learning_profile —
      # callers shouldn't have to remember to eager-load the association, and
      # under strict_loading_by_default the lazy traversal raises.
      @profile = LearningRoutesEngine::LearningProfile.find_by(user_id: user.id) if user
    end

    def design
      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :curriculum_design,
        variables: prompt_variables,
        user: @user,
        async: false
      )

      unless interaction.completed?
        Rails.logger.warn("[CurriculumBrain] LLM call did not complete: #{interaction.error_message}")
        return nil
      end

      payload = parse_response(interaction.response)
      validate!(payload)
      normalize(payload)
    rescue InvalidStructureError => e
      Rails.logger.warn("[CurriculumBrain] Invalid structure from LLM — falling back to template. Reason: #{e.message}")
      nil
    rescue => e
      Rails.logger.error("[CurriculumBrain] Unexpected failure — falling back to template. #{e.class}: #{e.message}")
      nil
    end

    private

    def prompt_variables
      style = learning_style_summary

      {
        # Route inputs
        topic: topic_label,
        custom_topic: @request.custom_topic.to_s,
        topics_list: Array(@request.topics).join(", "),
        # Language directive inputs — PromptBuilder will auto-compute {{language_directive}}
        locale: @content_locale,
        target_locale: @target_locale.to_s,
        # Profile inputs
        user_level: @request.level.to_s,
        pace: @request.pace.to_s.presence || "steady",
        weekly_hours: (@request.weekly_hours || @profile&.weekly_hours || 4).to_i,
        session_minutes: (@request.session_minutes || @profile&.session_minutes || 30).to_i,
        goals: Array(@request.goals).join(", ").presence || "general_learning",
        learning_style_primary: style[:primary],
        learning_style_secondary: style[:secondary],
        audio_pct: style[:audio_pct],
        text_pct: style[:text_pct],
        interactive_pct: style[:interactive_pct]
      }
    end

    def topic_label
      @request.custom_topic.presence || Array(@request.topics).first.to_s
    end

    # Learning style result lives in either the request's learning_style_result JSON
    # or the profile's saved_style_result JSON. Return a tidy summary with defaults
    # so the prompt always has numbers to interpolate.
    def learning_style_summary
      result = @request.learning_style_result.presence || @profile&.saved_style_result || {}
      result = result.with_indifferent_access

      mix = result["content_mix"] || { "audio" => 33, "text" => 34, "interactive" => 33 }

      {
        primary: result["dominant"].to_s.presence || "visual",
        secondary: result["secondary"].to_s.presence || "reading",
        audio_pct: mix["audio"].to_i,
        text_pct: mix["text"].to_i,
        interactive_pct: mix["interactive"].to_i
      }
    end

    def parse_response(raw)
      return {} if raw.blank?

      # Strip potential code fences the model may have added despite instructions.
      stripped = raw.to_s.gsub(/\A\s*```\w*\s*\n?/, "").gsub(/\n?\s*```\s*\z/, "").strip
      JSON.parse(stripped)
    rescue JSON::ParserError => e
      raise InvalidStructureError, "response is not valid JSON: #{e.message.truncate(120)}"
    end

    def validate!(payload)
      raise InvalidStructureError, "response is not a JSON object" unless payload.is_a?(Hash)

      missing = REQUIRED_ROUTE_KEYS - payload.keys
      raise InvalidStructureError, "missing top-level keys: #{missing.join(", ")}" if missing.any?

      steps = payload["steps"]
      raise InvalidStructureError, "steps must be a non-empty array" unless steps.is_a?(Array) && steps.any?
      raise InvalidStructureError, "too few steps: #{steps.size}" if steps.size < 3
      raise InvalidStructureError, "too many steps: #{steps.size}" if steps.size > 24

      family = payload["subject_family"].to_s
      unless ALLOWED_SUBJECT_FAMILIES.include?(family)
        raise InvalidStructureError, "invalid subject_family: #{family.inspect}"
      end

      steps.each_with_index do |step, idx|
        validate_step!(step, idx, steps.size)
      end

      # First step must have no prerequisites.
      first_prereqs = Array(steps.first["prerequisites"])
      raise InvalidStructureError, "first step has prerequisites" unless first_prereqs.empty?

      # First step must not be an assessment — placing an assessment at position 0
      # means asking the student to be tested on content the route hasn't taught yet.
      first_type = steps.first["content_type"].to_s
      raise InvalidStructureError, "first step is an assessment (#{first_type})" if first_type == "assessment"
    end

    def validate_step!(step, idx, total)
      raise InvalidStructureError, "step #{idx} is not an object" unless step.is_a?(Hash)

      missing = REQUIRED_STEP_KEYS - step.keys
      raise InvalidStructureError, "step #{idx} missing keys: #{missing.join(", ")}" if missing.any?

      unless (1..6).cover?(step["bloom_level"].to_i)
        raise InvalidStructureError, "step #{idx} bloom_level out of range: #{step["bloom_level"].inspect}"
      end

      unless ALLOWED_CONTENT_TYPES.include?(step["content_type"].to_s)
        raise InvalidStructureError, "step #{idx} bad content_type: #{step["content_type"].inspect}"
      end

      unless ALLOWED_DELIVERY_FORMATS.include?(step["delivery_format"].to_s)
        raise InvalidStructureError, "step #{idx} bad delivery_format: #{step["delivery_format"].inspect}"
      end

      unless ALLOWED_LEVEL_ENUMS.include?(step["level_enum"].to_s)
        raise InvalidStructureError, "step #{idx} bad level_enum: #{step["level_enum"].inspect}"
      end

      minutes = step["estimated_minutes"].to_i
      unless (5..90).cover?(minutes)
        raise InvalidStructureError, "step #{idx} estimated_minutes out of range: #{minutes}"
      end

      # Prerequisites must reference earlier steps only (no forward-refs, no self-refs).
      prereqs = Array(step["prerequisites"])
      prereqs.each do |p|
        unless p.is_a?(Integer) && p >= 0 && p < idx
          raise InvalidStructureError, "step #{idx} has bad prerequisite #{p.inspect}"
        end
      end

      unless step["translations"].is_a?(Hash) && step["translations"].any?
        raise InvalidStructureError, "step #{idx} missing translations hash"
      end
    end

    # Translate the validated LLM output into the exact shape
    # WizardRouteGenerationJob's step-creation code expects, so it's a drop-in
    # replacement for generate_fallback_route's output.
    def normalize(payload)
      {
        title: payload["title"].to_s,
        subtitle: payload["subtitle"].to_s,
        subject_area: payload["subject_area"].to_s,
        subject_family: payload["subject_family"].to_s,
        translations: payload["translations"].is_a?(Hash) ? payload["translations"] : {},
        steps: payload["steps"].map { |s| normalize_step(s) }
      }
    end

    def normalize_step(step)
      {
        label: step["label"].to_s,
        description: step["description"].to_s,
        level: step["level"].to_i.clamp(1, 5),
        level_enum: step["level_enum"].to_s,
        bloom_level: step["bloom_level"].to_i,
        content_type: step["content_type"].to_s,
        delivery_format: step["delivery_format"].to_s,
        estimated_minutes: step["estimated_minutes"].to_i,
        prerequisites: Array(step["prerequisites"]).map(&:to_i),
        exercise_types: Array(step["exercise_types"]).map(&:to_s),
        topics: Array(step["topics"]).map(&:to_s),
        translations: step["translations"].is_a?(Hash) ? step["translations"] : {}
      }
    end
  end
end
