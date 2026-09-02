require "test_helper"

module LearningRoutesEngine
  class RouteModuleTest < ActiveSupport::TestCase
    setup do
      user = create_test_user
      profile = LearningProfile.create!(user: user, current_level: "beginner")
      @route = LearningRoute.create!(learning_profile: profile, topic: "Distributed systems")
      @preview = RouteModule.find_by!(learning_route_id: @route.id)
    end

    test "access and generation states are independent" do
      assert_equal({ "preview" => 0, "locked" => 1, "purchased" => 2 }, RouteModule.access_states)
      assert_equal({ "outlined" => 0, "generating" => 1, "ready" => 2, "failed" => 3 }, RouteModule.generation_states)

      paid = @route.route_modules.create!(position: 2, title: "Advanced work",
        access_state: :locked, generation_state: :failed)

      assert paid.access_locked?
      assert paid.generation_failed?
    end

    test "requires a positive unique position and title" do
      invalid = @route.route_modules.build(position: 0, title: "", access_state: :locked)

      assert_not invalid.valid?
      assert_includes invalid.errors[:position], "must be greater than 0"
      assert_includes invalid.errors[:title], "can't be blank"

      duplicate = @route.route_modules.build(position: 1, title: "Duplicate", access_state: :locked)
      assert_not duplicate.valid?
      assert_includes duplicate.errors[:position], "has already been taken"
    end

    test "preview must be first and unique at the application boundary" do
      second = @route.route_modules.build(position: 2, title: "Wrong preview", access_state: :preview)

      assert_not second.valid?
      assert_includes second.errors[:access_state], "has already been taken"
      assert_includes second.errors[:position], "must be 1 for the preview module"
    end

    test "the application does not reclassify or destroy the permanent preview" do
      @preview.access_state = :locked

      assert_not @preview.valid?
      assert_includes @preview.errors[:access_state], "cannot change the permanent preview"
      assert_not @preview.destroy
      assert @preview.reload.access_preview?
    end

    test "localized copy falls back to persisted copy" do
      @preview.update!(title: "Free module", description: "Start here",
        translations: { "es" => { "title" => "Módulo gratis", "description" => "Empieza aquí" } })

      assert_equal "Módulo gratis", @preview.localized_title(:es)
      assert_equal "Empieza aquí", @preview.localized_description(:es)
      assert_equal "Free module", @preview.localized_title(:fr)
      assert_equal "Start here", @preview.localized_description(:fr)
    end

    test "route modules support arbitrary counts in deterministic order" do
      third = @route.route_modules.create!(position: 3, title: "Third", access_state: :locked)
      second = @route.route_modules.create!(position: 2, title: "Second", access_state: :locked)

      ids = RouteModule.where(learning_route_id: @route.id).order(:position, :id).pluck(:id)
      assert_equal [@preview.id, second.id, third.id], ids
    end
  end
end
