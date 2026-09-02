require "test_helper"

module LearningRoutesEngine
  class RouteModuleDatabaseTest < ActiveSupport::TestCase
    test "route modules are a first-class persisted domain type" do
      assert LearningRoutesEngine.const_defined?(:RouteModule, false),
        "expected LearningRoutesEngine::RouteModule to be defined"
    end

    test "route modules have a dedicated PostgreSQL table" do
      assert ActiveRecord::Base.connection.table_exists?(:learning_routes_engine_route_modules),
        "expected persisted route modules, not implicit level grouping"
    end

    test "PostgreSQL indexes positions and permits at most one preview" do
      indexes = ActiveRecord::Base.connection.indexes(:learning_routes_engine_route_modules).index_by(&:name)

      assert indexes.fetch("idx_route_modules_route_position").unique
      preview = indexes.fetch("idx_route_modules_single_preview")
      assert preview.unique
      assert_equal "(access_state = 0)", preview.where
    end

    test "fresh schemas retain the PostgreSQL preview triggers" do
      names = ActiveRecord::Base.connection.select_values(<<~SQL)
        SELECT tgname FROM pg_trigger
        WHERE NOT tgisinternal
          AND tgname IN (
            'learning_routes_exactly_one_preview',
            'route_modules_exactly_one_preview',
            'route_modules_preserve_preview'
          )
      SQL

      assert_equal %w[
        learning_routes_exactly_one_preview
        route_modules_exactly_one_preview
        route_modules_preserve_preview
      ], names.sort
    end

    test "learning routes own first-class modules" do
      route = build_route!

      assert_respond_to route, :route_modules
    end

    test "a newly created route receives one permanent first preview" do
      route = build_route!

      assert_equal 1, route.route_modules.count
      preview = RouteModule.find_by!(learning_route_id: route.id)
      assert_equal 1, preview.position
      assert_equal "preview", preview.access_state
    end

    test "PostgreSQL rejects a second preview when validations are bypassed" do
      route = build_route!

      assert_raises(ActiveRecord::RecordNotUnique) do
        RouteModule.transaction(requires_new: true) do
          RouteModule.insert!(module_attributes(route: route, position: 1, access_state: 0))
        end
      end
    end

    test "PostgreSQL rejects a preview outside the first position" do
      route = build_route!

      assert_raises(ActiveRecord::StatementInvalid) do
        RouteModule.transaction(requires_new: true) do
          RouteModule.insert!(module_attributes(route: route, position: 2, access_state: 0))
        end
      end
    end

    test "PostgreSQL prevents removing the permanent preview" do
      route = build_route!
      preview = RouteModule.find_by!(learning_route_id: route.id)

      assert_raises(ActiveRecord::StatementInvalid) do
        RouteModule.transaction(requires_new: true) { preview.delete }
      end
      assert_equal preview.id, RouteModule.find_by!(learning_route_id: route.id).id
    end

    test "deleting the route removes its preview through the database cascade" do
      route = build_route!
      preview_id = RouteModule.find_by!(learning_route_id: route.id).id

      route.delete

      assert_not RouteModule.exists?(preview_id)
    end

    test "PostgreSQL requires a preview when a route transaction commits" do
      existing = build_route!
      attributes = existing.attributes.slice(
        "learning_profile_id", "topic", "locale", "status", "current_step", "total_steps",
        "translations", "content_preferences", "difficulty_progression", "generation_params"
      ).merge("id" => SecureRandom.uuid, "created_at" => Time.current, "updated_at" => Time.current)

      assert_raises(ActiveRecord::StatementInvalid) do
        LearningRoute.transaction(requires_new: true) do
          LearningRoute.insert!(attributes)
          ActiveRecord::Base.connection.execute("SET CONSTRAINTS learning_routes_exactly_one_preview IMMEDIATE")
        end
      end
    end

    private

    def build_route!
      user = create_test_user
      profile = LearningProfile.create!(user: user, current_level: "beginner")
      LearningRoute.create!(learning_profile: profile, topic: "Database systems")
    end

    def module_attributes(route:, position:, access_state:)
      {
        learning_route_id: route.id,
        position: position,
        title: "Bypass",
        access_state: access_state,
        generation_state: 0,
        translations: {},
        metadata: {},
        created_at: Time.current,
        updated_at: Time.current
      }
    end
  end
end
