module AiOrchestrator
  class PromptBuilder
    def initialize(task_type:, context: {})
      @task_type = task_type
      @context = context
    end

    def build
      template = load_template
      interpolate(template, @context)
    end

    private

    def load_template
      path = Rails.root.join("config", "prompts", "#{@task_type}.yml")
      return default_template unless File.exist?(path)

      config = YAML.load_file(path, permitted_classes: [Symbol])
      config.dig("system_prompt") || default_template
    end

    def interpolate(template, variables)
      variables.reduce(template) do |result, (key, value)|
        result.gsub("{{#{key}}}", value.to_s)
      end
    end

    def default_template
      "You are an AI learning assistant. Task: #{@task_type}."
    end
  end
end
