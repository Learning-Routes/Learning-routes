# frozen_string_literal: true

module Commerce
  class RouteShape
    attr_reader :snapshot, :calls, :missing

    def initialize(route:, configuration:)
      @snapshot = {
        "outline" => deep_stringify(configuration.fetch(:outline, [])),
        "modules" => deep_stringify(configuration.fetch(:modules, []))
      }
      @calls = @snapshot.fetch("outline") + @snapshot.fetch("modules").flat_map do |route_module|
        route_module.fetch("steps", []).flat_map { |step| step.fetch("calls", []) }
      end
      @missing = validate(route)
    end

    private

    def validate(route)
      missing = []
      missing << "outline" if @snapshot.fetch("outline").empty?
      persisted_modules = LearningRoutesEngine::RouteModule.where(learning_route_id: route.id)
        .order(:position).pluck(:position, :access_state)
        .map do |position, access|
          access_name = access.is_a?(String) ? access : LearningRoutesEngine::RouteModule.access_states.key(access)
          { "position" => position, "access" => access_name }
        end
      described_modules = @snapshot.fetch("modules").map { |route_module| route_module.slice("position", "access") }
      missing << "modules.count" unless described_modules.size == persisted_modules.size
      missing << "modules.identity" unless described_modules == persisted_modules
      @calls.each_with_index do |call, index|
        missing.concat(call_missing(call).map { |key| "calls.#{index}.#{key}" })
      end
      missing
    end

    def call_missing(call)
      required = %w[kind calls]
      required += case call["kind"]
      when "text" then %w[model input_tokens output_tokens]
      when "image" then %w[model quality input_tokens image_input_tokens output_tokens]
      when "tts" then %w[model characters]
      when "stt" then %w[model audio_seconds]
      when "tavily" then %w[credits]
      else ["supported_kind"]
      end
      missing = required.reject { |key| call.key?(key) }
      numeric_keys = required & %w[calls input_tokens output_tokens image_input_tokens characters audio_seconds credits]
      numeric_keys.each do |key|
        value = call[key]
        missing << key unless value.is_a?(Integer) && value >= (key == "calls" ? 1 : 0)
      end
      missing.uniq
    end

    def deep_stringify(value)
      case value
      when Hash then value.to_h { |key, nested| [key.to_s, deep_stringify(nested)] }
      when Array then value.map { |nested| deep_stringify(nested) }
      else value
      end
    end
  end
end
