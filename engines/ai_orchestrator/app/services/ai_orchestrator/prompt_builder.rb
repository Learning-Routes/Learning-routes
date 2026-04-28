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

      system_prompt = interpolate(template_config["system_prompt"] || default_system_prompt)
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

    def interpolate(template)
      return "" if template.blank?

      result = template.dup

      # Interpolate provided variables
      @variables.each do |key, value|
        result.gsub!("{{#{key}}}", value.to_s)
      end

      # Ensure content_locale and target_locale are available as aliases
      result.gsub!("{{content_locale}}", @variables["locale"].to_s) unless @variables.key?("content_locale")
      result.gsub!("{{is_language_route}}", @variables["target_locale"].present?.to_s) unless @variables.key?("is_language_route")

      # Auto-compute the language directive (monolingual vs bilingual) unless the
      # caller explicitly provided a NON-EMPTY one. Empty/blank values fall back
      # to the computed directive — otherwise a caller passing `language_directive: ""`
      # would silently strip the most important instruction in the prompt.
      unless @variables["language_directive"].to_s.present?
        directive = LanguageInstructions.directive(
          content_locale: @variables["locale"],
          target_locale: @variables["target_locale"]
        )
        result.gsub!("{{language_directive}}", directive)
      end

      # Back-compat for older callers that still reference {{bilingual_instructions}}.
      # Same rule: empty/blank caller-provided value falls back to the auto-computed
      # bilingual block (or empty string for monolingual routes).
      unless @variables["bilingual_instructions"].to_s.present?
        fallback = if LanguageInstructions.bilingual?(content_locale: @variables["locale"], target_locale: @variables["target_locale"])
          LanguageInstructions.directive(content_locale: @variables["locale"], target_locale: @variables["target_locale"])
        else
          ""
        end
        result.gsub!("{{bilingual_instructions}}", fallback)
      end

      # Interpolate user context if available
      if @user
        result.gsub!("{{user_name}}", @user.name.to_s)
        result.gsub!("{{user_role}}", @user.role.to_s)

        if @user.respond_to?(:learning_profile) && @user.learning_profile
          profile = @user.learning_profile
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
