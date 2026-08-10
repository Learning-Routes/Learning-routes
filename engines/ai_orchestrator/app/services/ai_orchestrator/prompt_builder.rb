module AiOrchestrator
  class PromptBuilder
    TEMPLATES_PATH = File.expand_path("../../../../../config/prompts", __dir__)

    def initialize(task_type:, variables: {}, user: nil)
      @task_type = task_type.to_s
      @variables = variables.stringify_keys
      @user = user
    end

    def build
      template_config = load_template

      system_prompt = ensure_language_directive(
        interpolate(template_config["system_prompt"] || default_system_prompt)
      )
      user_prompt = interpolate(template_config["user_prompt"] || @variables["prompt"] || "")

      {
        system: system_prompt,
        user: user_prompt,
        model_params: template_config["model_params"] || {}
      }
    end

    def build_messages
      prompts = build
      messages = []
      messages << { role: "system", content: prompts[:system] } if prompts[:system].present?
      messages << { role: "user", content: prompts[:user] } if prompts[:user].present?
      messages
    end

    private

    def load_template
      path = File.join(TEMPLATES_PATH, "#{@task_type}.yml")

      unless File.exist?(path)
        path = File.join(engine_templates_path, "#{@task_type}.yml")
      end

      return default_config unless File.exist?(path)

      YAML.load_file(path, permitted_classes: [Symbol]) || default_config
    rescue => e
      Rails.logger.error("[AiOrchestrator::PromptBuilder] Error loading template: #{e.message}")
      default_config
    end

    def engine_templates_path
      File.expand_path("../../../config/prompts", __dir__)
    end

    # Guarantee the locale instruction reaches the model, token or no token.
    #
    # interpolate() applies the directive with gsub!, which is a no-op when the
    # template never mentions {{language_directive}}. Fourteen of the seventeen
    # templates did not — step_quiz, exam_questions, assessment_questions,
    # gap_analysis, quick_grading, exercise_hint and the rest — so they received no
    # locale instruction at all and answered in whatever language they felt like.
    # That is why a Spanish learner got Spanish lessons and English quizzes.
    #
    # The token has since been added to all seventeen, so this is the belt to that
    # pair of braces: a template added later without the token still gets the
    # directive rather than silently regressing.
    def ensure_language_directive(prompt)
      return prompt if prompt.blank?

      directive = computed_language_directive
      return prompt if directive.blank?
      return prompt if prompt.include?(directive)

      "#{prompt}\n\n#{directive}"
    end

    def computed_language_directive
      @computed_language_directive ||=
        if @variables["language_directive"].to_s.present?
          @variables["language_directive"].to_s
        else
          LanguageInstructions.directive(
            content_locale: resolved_locale,
            target_locale: @variables["target_locale"]
          ).to_s
        end
    end

    # A caller that omits `locale` is a bug, not a defaultable condition.
    #
    # LanguageInstructions.language_name(nil) falls through its chain to "English", so
    # an omitted locale did not produce a vague prompt — it produced a confident,
    # well-formed instruction to "Write the ENTIRE lesson in English". On a
    # Spanish-first product that is both wrong and silent, and eight of thirteen call
    # sites had it.
    #
    # So: fail loudly where a developer is watching, degrade where a student is. Same
    # shape as the strict-loading policy (WP-2) and Orchestrate::ConfigurationError
    # (WP-5) — the codebase already treats "misconfiguration" and "bad runtime input"
    # as different kinds of problem, and this is the former.
    #
    # The production fallback is I18n.default_locale rather than a hardcoded language
    # name, so at least it tracks the application's own setting.
    def resolved_locale
      locale = @variables["locale"].to_s
      return locale if locale.present?

      message = "[PromptBuilder] task_type=#{@task_type} was called without a `locale` " \
                "variable. The language directive would silently instruct the model to " \
                "write in #{LanguageInstructions.language_name(nil)}. Pass " \
                "AiOrchestrator::LocaleResolver.for_route(route, user: user)."

      raise ArgumentError, message if Rails.env.local?

      Rails.logger.error(message)
      Rails.error.report(ArgumentError.new(message), handled: true, severity: :error,
                                                     source: "ai_orchestrator.prompt_builder")
      I18n.default_locale.to_s
    end

    def interpolate(template)
      return "" if template.blank?

      result = template.dup

      # Interpolate provided variables
      @variables.each do |key, value|
        result.gsub!("{{#{key}}}", value.to_s)
      end

      # Ensure content_locale and target_locale are available as aliases.
      # resolved_locale, not the raw variable: these aliases feed the prompt's own
      # LANGUAGE MODE prose, so they must agree with the directive.
      result.gsub!("{{content_locale}}", resolved_locale) unless @variables.key?("content_locale")
      result.gsub!("{{is_language_route}}", @variables["target_locale"].present?.to_s) unless @variables.key?("is_language_route")

      # Auto-compute the language directive (monolingual vs bilingual) unless the
      # caller explicitly provided a NON-EMPTY one. Empty/blank values fall back
      # to the computed directive — otherwise a caller passing `language_directive: ""`
      # would silently strip the most important instruction in the prompt.
      # Reuse computed_language_directive rather than recomputing from the raw
      # variable. These were two separate computations from the same inputs, and when
      # the guard was added to only one of them a prompt could end up carrying BOTH an
      # English directive (substituted into the token) and a Spanish one (appended) —
      # the token path had silently kept the nil-means-English behaviour.
      unless @variables["language_directive"].to_s.present?
        result.gsub!("{{language_directive}}", computed_language_directive)
      end

      # Back-compat for older callers that still reference {{bilingual_instructions}}.
      # Same rule: empty/blank caller-provided value falls back to the auto-computed
      # bilingual block (or empty string for monolingual routes).
      unless @variables["bilingual_instructions"].to_s.present?
        fallback = if LanguageInstructions.bilingual?(content_locale: resolved_locale, target_locale: @variables["target_locale"])
          LanguageInstructions.directive(content_locale: resolved_locale, target_locale: @variables["target_locale"])
        else
          ""
        end
        result.gsub!("{{bilingual_instructions}}", fallback)
      end

      # Interpolate user context if available
      if @user
        result.gsub!("{{user_name}}", @user.name.to_s)
        result.gsub!("{{user_role}}", @user.role.to_s)

        # Query the profile rather than traversing @user.learning_profile.
        # strict_loading_by_default is on, so the lazy has_one raised here on EVERY
        # Orchestrate call that carried a user — including curriculum_design. Same
        # fix and same reason as RouteWizardController#new and CurriculumBrain#initialize.
        profile = LearningRoutesEngine::LearningProfile.find_by(user_id: @user.id)
        if profile
          result.gsub!("{{user_level}}", profile.current_level.to_s)
          result.gsub!("{{learning_style}}", Array(profile.learning_style).join(", "))
          result.gsub!("{{interests}}", Array(profile.interests).join(", "))
          result.gsub!("{{goal}}", profile.goal.to_s)
        end
      end

      # Remove any remaining unresolved placeholders
      result.gsub!(/\{\{[^}]+\}\}/, "")
      result.strip
    end

    def default_system_prompt
      "You are an AI learning assistant specializing in personalized education. " \
      "Task type: #{@task_type.humanize}. " \
      "Provide clear, structured, and pedagogically sound responses."
    end

    def default_config
      {
        "system_prompt" => default_system_prompt,
        "user_prompt" => @variables["prompt"] || "",
        "model_params" => {}
      }
    end
  end
end
