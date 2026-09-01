require "test_helper"

module LearningRoutesEngine
  class RouteStepModuleTest < ActiveSupport::TestCase
    setup do
      user = create_test_user
      profile = LearningProfile.create!(user: user, current_level: "beginner")
      @route = LearningRoute.create!(learning_profile: profile, topic: "Module ownership")
      @preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
    end

    test "route steps have a persisted module reference" do
      assert RouteStep.column_names.include?("route_module_id"),
        "expected route steps to persist their first-class module ownership"
    end

    test "route steps may reference their module during the compatibility phase" do
      step = RouteStep.create!(learning_route: @route, route_module: @preview,
        position: 1, title: "Introduction", status: :in_progress)
      loaded_module = RouteModule.includes(:route_steps).find(@preview.id)

      assert_equal @preview, step.route_module
      assert_equal [step], loaded_module.route_steps.to_a
      assert_equal :in_progress, step.status.to_sym
    end

    test "a module exposes steps in deterministic route order" do
      later = RouteStep.create!(learning_route: @route, route_module: @preview,
        position: 2, title: "Later")
      earlier = RouteStep.create!(learning_route: @route, route_module: @preview,
        position: 1, title: "Earlier")
      loaded_module = RouteModule.includes(:route_steps).find(@preview.id)

      assert_equal [earlier.id, later.id], loaded_module.route_steps.map(&:id)
    end

    test "application validation rejects a module from another route" do
      other_profile = LearningProfile.create!(user: create_test_user, current_level: "beginner")
      other_route = LearningRoute.create!(learning_profile: other_profile, topic: "Other route")
      other_module = RouteModule.find_by!(learning_route_id: other_route.id, access_state: :preview)
      step = RouteStep.new(learning_route: @route, route_module: other_module,
        position: 1, title: "Forged ownership")

      assert_not step.valid?
      assert_includes step.errors[:route_module], "must belong to the same learning route"
    end

    test "validating a persisted module-backed step does not require eager loading" do
      step = RouteStep.create!(learning_route: @route, route_module: @preview,
        position: 1, title: "Persisted step")
      step = RouteStep.find(step.id)

      assert step.update(title: "Updated step")
      assert_equal @preview.id, step.reload.route_module_id
    end

    test "PostgreSQL rejects cross-route module ownership" do
      other_profile = LearningProfile.create!(user: create_test_user, current_level: "beginner")
      other_route = LearningRoute.create!(learning_profile: other_profile, topic: "Other route")
      other_module = RouteModule.find_by!(learning_route_id: other_route.id, access_state: :preview)
      step = RouteStep.create!(learning_route: @route, position: 1, title: "Existing step")

      assert_raises(ActiveRecord::InvalidForeignKey) do
        RouteStep.transaction(requires_new: true) do
          step.update_column(:route_module_id, other_module.id)
        end
      end
      assert_nil step.reload.route_module_id
    end

    test "existing steps remain valid without a module until backfill" do
      step = RouteStep.create!(learning_route: @route, position: 1, title: "Legacy step",
        status: :completed, completed_at: Time.current)

      assert step.valid?
      assert_nil step.route_module
      assert step.completed?
    end
  end
end
