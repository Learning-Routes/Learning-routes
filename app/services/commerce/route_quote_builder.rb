# frozen_string_literal: true

module Commerce
  class RouteQuoteBuilder
    Available = Data.define(:quote) do
      def available? = true
    end
    Unavailable = Data.define(:reason, :missing) do
      def available? = false
    end

    def self.call(route:, estimator_configuration:, fee_configuration:, expires_in: 24.hours)
      new(route, estimator_configuration, fee_configuration, expires_in).call
    end

    def initialize(route, estimator_configuration, fee_configuration, expires_in)
      @route = route
      @estimator_configuration = estimator_configuration
      @fee_configuration = fee_configuration
      @expires_in = expires_in
    end

    def call
      module_count = LearningRoutesEngine::RouteModule.where(learning_route_id: @route.id).count
      return Unavailable.new(reason: "no_paid_modules", missing: []) if module_count == 1

      estimate = RouteCostEstimator.call(route: @route, configuration: @estimator_configuration)
      return Unavailable.new(reason: estimate.reason, missing: estimate.missing) unless estimate.available?

      fee = FeeConfiguration.call(@fee_configuration)
      return Unavailable.new(reason: fee.reason, missing: fee.missing) unless fee.available?

      Available.new(quote: persist_quote(estimate, fee, module_count))
    end

    private

    def persist_quote(estimate, fee, module_count)
      gross = LemonSqueezyFeeEstimator.call(
        ai_cost_microcents: estimate.cost_microcents,
        percentage_basis_points: fee.percentage_basis_points,
        fixed_cents: fee.fixed_cents
      )
      minimum = (module_count - 1) * 299
      final = [gross.gross_cents, minimum].max
      estimated_fee = Rational(final * fee.percentage_basis_points, 10_000).ceil + fee.fixed_cents
      profile = LearningRoutesEngine::LearningProfile.find(@route.learning_profile_id)

      RouteQuote.create_snapshot!(
        user: Core::User.find(profile.user_id), learning_route: @route, currency: "USD",
        total_module_count: module_count, paid_module_count: module_count - 1,
        estimated_ai_cost_microcents: estimate.cost_microcents, estimated_fee_cents: estimated_fee,
        markup_basis_points: 5000, minimum_price_per_paid_module_cents: 299,
        cost_based_price_cents: gross.gross_cents, minimum_price_cents: minimum, final_price_cents: final,
        estimator_version: estimate.estimator_version, provider_rate_versions: estimate.provider_rate_versions,
        fee_version: fee.version, image_quality: estimate.image_quality,
        route_shape_assumptions: estimate.route_shape_assumptions,
        provider_rate_assumptions: estimate.provider_rate_assumptions,
        fee_assumptions: fee.snapshot, expires_at: @expires_in.from_now
      )
    end
  end
end
