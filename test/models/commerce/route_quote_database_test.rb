require "test_helper"

module Commerce
  class RouteQuoteDatabaseTest < ActiveSupport::TestCase
    setup do
      @user = create_test_user
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "DB pricing")
      @quote = RouteQuote.create!(attributes)
    end

    test "PostgreSQL rejects a quote for a route owned by another user" do
      other = create_test_user

      assert_raises(ActiveRecord::StatementInvalid) do
        RouteQuote.insert!(attributes.merge(id: SecureRandom.uuid, user_id: other.id,
          created_at: Time.current, updated_at: Time.current))
      end
    end

    test "PostgreSQL rejects changes to every pricing snapshot" do
      RouteQuote::IMMUTABLE_ATTRIBUTES.each do |attribute|
        replacement = replacement_for(attribute)
        assert_raises(ActiveRecord::StatementInvalid, "expected #{attribute} to be immutable") do
          RouteQuote.transaction(requires_new: true) do
            @quote.update_column(attribute, replacement)
          end
        end
      end
    end

    test "PostgreSQL permits lifecycle changes but enforces lifecycle values" do
      now = Time.current
      @quote.update_columns(superseded_at: now, attachment_state: "checkout", updated_at: now)
      assert_equal "checkout", @quote.reload.attachment_state

      assert_raises(ActiveRecord::StatementInvalid) do
        RouteQuote.transaction(requires_new: true) do
          @quote.update_column(:attachment_state, "invented")
        end
      end
    end

    test "PostgreSQL enforces module and monetary formulas on direct inserts" do
      invalid_sets = [
        { currency: "CRC" },
        { total_module_count: 0, paid_module_count: -1, minimum_price_cents: -299 },
        { paid_module_count: 1 },
        { markup_basis_points: 4999 },
        { minimum_price_per_paid_module_cents: 1 },
        { minimum_price_cents: 1 },
        { final_price_cents: 699 },
        { estimated_ai_cost_microcents: -1 },
        { expires_at: 1.day.ago }
      ]

      invalid_sets.each do |changes|
        assert_raises(ActiveRecord::StatementInvalid, "expected rejection for #{changes.keys.join(', ')}") do
          RouteQuote.transaction(requires_new: true) do
            RouteQuote.insert!(attributes.merge(changes).merge(id: SecureRandom.uuid,
              created_at: Time.current, updated_at: Time.current))
          end
        end
      end
    end

    private

    def attributes
      {
        user_id: @user.id, learning_route_id: @route.id, currency: "USD",
        total_module_count: 3, paid_module_count: 2,
        estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 100,
        markup_basis_points: 5000, minimum_price_per_paid_module_cents: 299,
        cost_based_price_cents: 700, minimum_price_cents: 598, final_price_cents: 700,
        estimator_version: "route-cost-v1", provider_rate_versions: { "openai" => "v1" },
        fee_version: "fee-v1", image_quality: "medium",
        route_shape_assumptions: { "modules" => 3 },
        provider_rate_assumptions: { "openai" => { "version" => "v1" } },
        fee_assumptions: { "percentage_basis_points" => 500 }, expires_at: 1.day.from_now
      }
    end

    def replacement_for(attribute)
      value = @quote.public_send(attribute)
      case value
      when Integer then value + 1
      when String then "changed-#{value}"
      when Hash then value.merge("changed" => true)
      when ActiveSupport::TimeWithZone, Time then value + 1.hour
      else SecureRandom.uuid
      end
    end
  end
end
