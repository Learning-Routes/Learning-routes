# frozen_string_literal: true

module LearningRoutesEngine
  class LegacyModuleBackfill
    MAPPING_VERSION = "legacy-levels-v1"
    LEVEL_NAMES = {
      0 => { "en" => "Foundations", "es" => "Fundamentos", key: "nv1" },
      1 => { "en" => "Application", "es" => "Aplicación", key: "nv2" },
      2 => { "en" => "Mastery", "es" => "Dominio", key: "nv3" }
    }.freeze

    def self.call(route)
      new(route).call
    end

    def initialize(route)
      @route = route
    end

    def call
      @route.with_lock do
        steps = RouteStep.where(learning_route_id: @route.id).order(:position, :id).to_a
        if steps.empty?
          ensure_empty_preview!
          return
        end
        return if steps.all? { |step| step.route_module_id.present? }

        groups = steps.group_by { |step| raw_level(step) }.values
        modules = groups.each_with_index.map { |group, index| module_for(group, index + 1) }
        groups.zip(modules).each do |group, route_module|
          RouteStep.where(id: group.map(&:id)).update_all(route_module_id: route_module.id)
        end
      end
    end

    private

    def ensure_empty_preview!
      preview = preview_module || @route.route_modules.create!(
        position: 1, title: "Free preview", access_state: :preview, generation_state: :outlined
      )
      preview.update!(generation_state: :outlined, metadata: preview.metadata.merge(backfill_metadata(nil)))
    end

    def module_for(steps, position)
      details = level_details(raw_level(steps.first))
      route_module = if position == 1
        preview_module || @route.route_modules.create!(position: 1, title: details.fetch("en"), access_state: :preview)
      else
        RouteModule.find_or_initialize_by(learning_route_id: @route.id, position: position)
      end

      route_module.assign_attributes(
        title: details.fetch("en"),
        description: nil,
        translations: {
          "es" => { "title" => details.fetch("es") }
        },
        access_state: position == 1 ? :preview : :locked,
        generation_state: generation_state(steps),
        metadata: route_module.metadata.merge(backfill_metadata(details.fetch(:key)))
      )
      route_module.save!
      route_module
    end

    def preview_module
      @preview_module ||= RouteModule.find_by(learning_route_id: @route.id, access_state: :preview)
    end

    def raw_level(step)
      step.read_attribute_before_type_cast(:level)
    end

    def level_details(raw_level)
      LEVEL_NAMES.fetch(raw_level) do
        {
          "en" => "Imported module (level #{raw_level})",
          "es" => "Módulo importado (nivel #{raw_level})",
          key: "unknown:#{raw_level}"
        }
      end
    end

    def generation_state(steps)
      return :ready if steps.all?(&:content_ready?)
      return :failed if @route.generation_status == "failed"
      return :generating if @route.generation_status == "generating"

      :outlined
    end

    def backfill_metadata(level)
      {
        "mapping_source" => "route_step.level",
        "mapping_version" => MAPPING_VERSION,
        "legacy_level" => level
      }.compact
    end
  end
end
