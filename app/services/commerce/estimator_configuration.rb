# frozen_string_literal: true

module Commerce
  # Assembles the `configuration:` hash RouteCostEstimator consumes.
  #
  # The route SHAPE comes from the database — RouteShape rejects any description
  # whose module count or access states disagree with the persisted rows, so the
  # shape can never be a caller's guess. The per-call token/character/credit
  # assumptions come from configuration, because they are estimates about work
  # not yet done and must be versioned and snapshotted rather than inferred.
  #
  # Fails closed. A missing key produces an Unavailable naming that key, never a
  # zero and never a default fee schedule.
  class EstimatorConfiguration
    Available = Data.define(:configuration) do
      def available? = true
    end
    Unavailable = Data.define(:reason, :missing) do
      def available? = false
    end

    REQUIRED_KEYS = %i[estimator_version image_quality outline step_calls].freeze

    def self.raw
      Rails.application.config.x.commerce_estimator || {}
    end

    def self.call(route:, raw: self.raw)
      new(route, raw || {}).call
    end

    def initialize(route, raw)
      @route = route
      @raw = raw.symbolize_keys
    end

    def call
      missing = REQUIRED_KEYS.filter_map { |key| "estimator.#{key}" if @raw[key].blank? }
      return Unavailable.new(reason: "estimator_configuration_missing", missing: missing) if missing.any?

      modules, module_missing = describe_modules
      return Unavailable.new(reason: "estimator_configuration_missing", missing: module_missing) if module_missing.any?

      Available.new(configuration: {
        estimator_version: @raw.fetch(:estimator_version),
        image_quality: @raw.fetch(:image_quality),
        outline: @raw.fetch(:outline),
        modules: modules,
        provider_versions: (@raw[:provider_versions] || {}).transform_keys(&:to_s),
        tavily: (@raw[:tavily] || {}).symbolize_keys
      })
    end

    private

    # One query for modules, one for steps. Neither traverses an association, so
    # strict_loading has nothing to object to.
    def describe_modules
      step_rows = LearningRoutesEngine::RouteStep
        .where(learning_route_id: @route.id)
        .order(:position, :id)
        .pluck(:route_module_id, :content_type, :position)

      steps_by_module = step_rows.group_by(&:first)
      shapes = (@raw.fetch(:step_calls) || {}).transform_keys(&:to_s)
      missing = []

      modules = LearningRoutesEngine::RouteModule
        .where(learning_route_id: @route.id)
        .order(:position, :id)
        .pluck(:id, :position, :access_state)
        .map do |id, position, access_state|
          access = LearningRoutesEngine::RouteModule.access_states.key(access_state) || access_state.to_s
          steps = (steps_by_module[id] || []).map do |_module_id, content_type, _position|
            calls = shapes[content_type.to_s]
            missing << "estimator.step_calls.#{content_type}" if calls.blank?
            { "content_type" => content_type.to_s, "calls" => calls || [] }
          end
          { "position" => position, "access" => access, "steps" => steps }
        end

      [modules, missing.uniq]
    end
  end
end
