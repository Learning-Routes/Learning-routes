require "test_helper"

class Commerce::EstimatorConfigurationTest < ActiveSupport::TestCase
  def setup
    @user = Core::User.create!(
      name: "Quoter", email: "quote-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "AWS", locale: "en", status: :active
    )
    LearningRoutesEngine::RouteModule.create!(
      learning_route: @route, position: 2, title: "Paid", access_state: :locked, generation_state: :outlined
    )
  end

  def configured
    {
      estimator_version: "wp18-v1",
      image_quality: "medium",
      outline: [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                  "input_tokens" => 2_000, "output_tokens" => 4_000 }],
      step_calls: {
        "lesson" => [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                       "input_tokens" => 3_000, "output_tokens" => 6_000 }]
      },
      provider_versions: { "gpt-5.2" => "2026-08-31" },
      tavily: { microcents_per_credit: 80, version: "2026-08-31" }
    }
  end

  test "it describes every persisted module in database order with its real access state" do
    result = Commerce::EstimatorConfiguration.call(route: @route, raw: configured)

    assert result.available?, result.respond_to?(:missing) ? result.missing.inspect : nil
    described = result.configuration.fetch(:modules)
    assert_equal [{ "position" => 1, "access" => "preview" }, { "position" => 2, "access" => "locked" }],
                 described.map { |m| m.slice("position", "access") }
  end

  test "the produced configuration satisfies RouteShape with no missing keys" do
    result = Commerce::EstimatorConfiguration.call(route: @route, raw: configured)
    shape = Commerce::RouteShape.new(route: @route, configuration: result.configuration)

    assert_empty shape.missing
  end

  test "absent configuration is unavailable and names only configuration keys" do
    result = Commerce::EstimatorConfiguration.call(route: @route, raw: {})

    assert_not result.available?
    assert_equal "estimator_configuration_missing", result.reason
    assert_includes result.missing, "estimator.estimator_version"
    assert_includes result.missing, "estimator.image_quality"
    assert_includes result.missing, "estimator.outline"
    assert_includes result.missing, "estimator.step_calls"
    result.missing.each { |key| assert_match(/\Aestimator\./, key) }
  end

  test "a step content type with no configured call shape is named explicitly" do
    @route.route_steps.create!(
      route_module: LearningRoutesEngine::RouteModule.find_by!(learning_route_id: @route.id, position: 1),
      position: 0, title: "S", level: 1, bloom_level: 1,
      content_type: :assessment, delivery_format: "text", status: :available
    )

    result = Commerce::EstimatorConfiguration.call(route: @route, raw: configured)

    assert_not result.available?
    assert_includes result.missing, "estimator.step_calls.assessment"
  end

  test "it never reads a secret into the missing list" do
    result = Commerce::EstimatorConfiguration.call(route: @route, raw: {})
    result.missing.each { |key| assert_no_match(/key|secret|token|password/i, key) }
  end
end
