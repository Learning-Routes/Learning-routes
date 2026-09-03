# frozen_string_literal: true

module Commerce
  class RouteCostEstimator
    Available = Data.define(:cost_microcents, :estimator_version, :provider_rate_versions,
      :provider_rate_assumptions, :route_shape_assumptions, :image_quality) do
      def available? = true
    end
    Unavailable = Data.define(:reason, :missing) do
      def available? = false
    end

    def self.call(route:, configuration:)
      new(route, configuration).call
    end

    def initialize(route, configuration)
      @route = route
      @configuration = configuration
    end

    def call
      shape = RouteShape.new(route: @route, configuration: @configuration)
      catalog = ProviderRateCatalog.new(@configuration)
      missing = base_missing + shape.missing + shape.calls.flat_map { |call| catalog.missing_for(call) }
      return Unavailable.new(reason: "pricing_configuration_missing", missing: missing.uniq.sort) if missing.any?

      # A KeyError from here IS a bug, not missing configuration: `missing` above
      # already proved every required key is present. Letting it raise is the point.
      Available.new(
        cost_microcents: shape.calls.sum { |call| catalog.estimate_microcents(call) },
        estimator_version: @configuration.fetch(:estimator_version),
        provider_rate_versions: catalog.versions_for(shape.calls),
        provider_rate_assumptions: catalog.rate_assumptions_for(shape.calls),
        route_shape_assumptions: shape.snapshot,
        image_quality: @configuration.fetch(:image_quality)
      )
    end

    private

    def base_missing
      missing = []
      missing << "estimator_version" if @configuration[:estimator_version].blank?
      missing << "image_quality" if @configuration[:image_quality].blank?
      missing
    end
  end
end
