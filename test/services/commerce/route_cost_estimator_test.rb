require "test_helper"

module Commerce
  class RouteCostEstimatorTest < ActiveSupport::TestCase
    setup do
      user = create_test_user
      profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "Estimate")
    end

    test "estimates outline preview and paid modules with exact WP-7 arithmetic" do
      @route.route_modules.create!(position: 2, title: "Paid", access_state: :locked)
      result = RouteCostEstimator.call(route: @route, configuration: valid_configuration)

      assert result.available?
      # text: (2,000*40 + 1,000*160)/100 = 2,400 microcents
      # image: (100*500 + 50*1,000 + 200*4,000)/100 = 9,000 microcents
      # TTS: 2,000*10 cents/1k = 20 cents = 200,000 microcents
      # Tavily: 2 credits * 25,000 microcents = 50,000 microcents
      assert_equal 261_400, result.cost_microcents
      assert_equal "route-cost-v1", result.estimator_version
      assert_equal "medium", result.image_quality
      assert_equal "openai-2026-08-31", result.provider_rate_versions.fetch("gpt-4.1-mini")
      assert_equal 2, result.route_shape_assumptions.fetch("modules").size
    end

    test "supports a one-module route with zero paid modules" do
      config = valid_configuration.deep_dup
      config[:modules] = config[:modules].first(1)

      result = RouteCostEstimator.call(route: @route, configuration: config)

      assert result.available?
      assert_equal 261_400, result.cost_microcents
      assert_equal 1, result.route_shape_assumptions.fetch("modules").size
    end

    test "fails closed and names missing configuration keys without substituting zero" do
      @route.route_modules.create!(position: 2, title: "Paid", access_state: :locked)
      config = valid_configuration.deep_dup
      config[:tavily].delete(:version)
      config[:provider_versions].delete("gpt-image-1")

      result = RouteCostEstimator.call(route: @route, configuration: config)

      assert_not result.available?
      assert_equal "pricing_configuration_missing", result.reason
      assert_includes result.missing, "tavily.version"
      assert_includes result.missing, "provider_versions.gpt-image-1"
      assert_not result.missing.any? { |key| key.match?(/key|secret|token/) }
    end

    test "rejects a route shape that omits modules or outline usage" do
      result = RouteCostEstimator.call(route: @route,
        configuration: valid_configuration.merge(outline: [], modules: []))

      assert_not result.available?
      assert_includes result.missing, "outline"
      assert_includes result.missing, "modules.count"
    end

    test "binds assumptions to persisted module positions and access states" do
      config = valid_configuration.deep_dup
      config[:modules] = config[:modules].first(1)
      config[:modules].first[:access] = "locked"

      result = RouteCostEstimator.call(route: @route, configuration: config)

      assert_not result.available?
      assert_includes result.missing, "modules.identity"
    end

    test "rejects floating point and incomplete usage assumptions" do
      config = valid_configuration.deep_dup
      config[:outline].first[:input_tokens] = 1.5
      config[:modules].first[:steps].first[:calls].first.delete(:output_tokens)

      result = RouteCostEstimator.call(route: @route, configuration: config.tap { |value| value[:modules] = value[:modules].first(1) })

      assert_not result.available?
      assert_includes result.missing, "calls.0.input_tokens"
      assert result.missing.any? { |key| key.end_with?("output_tokens") }
    end

    test "a genuine internal KeyError is raised, not reported as missing configuration" do
      # Minitest::Mock#stub ships in a separate gem this bundle does not pin
      # (Minitest 6 split `stub` out of core), so the collaborator is swapped
      # in by hand and restored in `ensure` rather than via `.stub`.
      @route.route_modules.create!(position: 2, title: "Paid", access_state: :locked)
      configuration = valid_configuration
      catalog = Commerce::ProviderRateCatalog.new(configuration)
      def catalog.estimate_microcents(_call) = raise(KeyError, "internal defect")

      Commerce::ProviderRateCatalog.define_singleton_method(:new) { |*| catalog }
      begin
        assert_raises(KeyError) do
          Commerce::RouteCostEstimator.call(route: @route, configuration: configuration)
        end
      ensure
        Commerce::ProviderRateCatalog.singleton_class.send(:remove_method, :new)
      end
    end

    private

    def valid_configuration
      {
        estimator_version: "route-cost-v1",
        image_quality: "medium",
        provider_versions: {
          "gpt-4.1-mini" => "openai-2026-08-31",
          "gpt-image-1" => "openai-2026-08-31",
          "eleven_multilingual_v2" => "elevenlabs-2026-08-31"
        },
        tavily: { microcents_per_credit: 25_000, version: "tavily-account-v1" },
        outline: [
          { kind: "text", model: "gpt-4.1-mini", calls: 1,
            input_tokens: 1_000, output_tokens: 500 }
        ],
        modules: [
          {
            position: 1,
            access: "preview",
            steps: [{ calls: [
              { kind: "text", model: "gpt-4.1-mini", calls: 1,
                input_tokens: 1_000, output_tokens: 500 },
              { kind: "image", model: "gpt-image-1", calls: 1, quality: "medium",
                input_tokens: 100, image_input_tokens: 50, output_tokens: 200 },
              { kind: "tts", model: "eleven_multilingual_v2", calls: 1, characters: 2_000 },
              { kind: "tavily", calls: 1, credits: 2 }
            ] }]
          },
          { position: 2, access: "locked", steps: [] }
        ]
      }
    end
  end
end
