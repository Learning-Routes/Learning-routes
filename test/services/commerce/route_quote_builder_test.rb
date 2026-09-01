require "test_helper"

module Commerce
  class RouteQuoteBuilderTest < ActiveSupport::TestCase
    setup do
      @user = create_test_user
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "Quote builder")
    end

    test "minimum price wins and the fee snapshot is based on the final price" do
      add_paid_module
      result = RouteQuoteBuilder.call(route: @route,
        estimator_configuration: estimator_configuration(ai_tokens: 1),
        fee_configuration: fee_configuration)

      assert result.available?
      quote = result.quote
      assert_equal 299, quote.minimum_price_cents
      assert_equal 299, quote.final_price_cents
      assert_equal 65, quote.estimated_fee_cents
      assert_equal 5000, quote.markup_basis_points
      assert_equal({ "input" => 40, "output" => 160 },
        quote.provider_rate_assumptions.fetch("gpt-4.1-mini"))
      assert_not quote.provider_rate_assumptions.key?("tavily")
      assert_equal({ "percentage_basis_points" => 500, "fixed_cents" => 50,
        "currency" => "USD", "version" => "configured-fees-v1" }, quote.fee_assumptions)
    end

    test "cost-based price wins and covers markup plus estimated fee" do
      add_paid_module
      result = RouteQuoteBuilder.call(route: @route,
        estimator_configuration: estimator_configuration(ai_tokens: 2_000_000),
        fee_configuration: fee_configuration)

      quote = result.quote
      assert_operator quote.cost_based_price_cents, :>, quote.minimum_price_cents
      marked_up = Rational(quote.estimated_ai_cost_microcents * 3, 2 * 10_000).ceil
      assert_operator quote.final_price_cents - quote.estimated_fee_cents, :>=, marked_up
    end

    test "one preview module produces no paid quote" do
      result = RouteQuoteBuilder.call(route: @route,
        estimator_configuration: estimator_configuration(ai_tokens: 1),
        fee_configuration: fee_configuration)

      assert_not result.available?
      assert_equal "no_paid_modules", result.reason
      assert_empty RouteQuote.where(learning_route_id: @route.id)
    end

    test "missing fee or provider configuration persists nothing" do
      add_paid_module
      %i[percentage_basis_points fixed_cents version].each do |key|
        missing_fee = RouteQuoteBuilder.call(route: @route,
          estimator_configuration: estimator_configuration(ai_tokens: 1),
          fee_configuration: fee_configuration.except(key))
        assert_equal "fee_configuration_missing", missing_fee.reason
        assert_includes missing_fee.missing, "fee.#{key}"
      end
      missing_provider = RouteQuoteBuilder.call(route: @route,
        estimator_configuration: estimator_configuration(ai_tokens: 1).merge(provider_versions: {}),
        fee_configuration: fee_configuration)

      assert_equal "pricing_configuration_missing", missing_provider.reason
      assert_empty RouteQuote.where(learning_route_id: @route.id)
    end

    private

    def add_paid_module
      @route.route_modules.create!(position: 2, title: "Paid", access_state: :locked)
    end

    def estimator_configuration(ai_tokens:)
      modules = LearningRoutesEngine::RouteModule.where(learning_route_id: @route.id).order(:position).map do |route_module|
        { position: route_module.position, access: route_module.access_state, steps: [] }
      end
      {
        estimator_version: "route-cost-v1", image_quality: "medium",
        provider_versions: { "gpt-4.1-mini" => "openai-2026-08-31" },
        tavily: { microcents_per_credit: 25_000, version: "tavily-v1" },
        outline: [{ kind: "text", model: "gpt-4.1-mini", calls: 1,
          input_tokens: ai_tokens, output_tokens: ai_tokens }],
        modules: modules
      }
    end

    def fee_configuration
      { percentage_basis_points: 500, fixed_cents: 50, version: "configured-fees-v1" }
    end
  end
end
