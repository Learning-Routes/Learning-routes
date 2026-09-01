require "test_helper"

module LearningRoutesEngine
  class ModuleAccessPolicyTest < ActiveSupport::TestCase
    setup do
      @user = create_test_user
      @profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(learning_profile: @profile, topic: "Authorization")
      @preview = @route.route_modules.find_by!(access_state: :preview)
      @paid = @route.route_modules.create!(
        position: 2, title: "Paid module", access_state: :locked, generation_state: :outlined
      )
      @preview_step = @route.route_steps.create!(
        route_module: @preview, position: 1, title: "Preview", status: :available
      )
      @paid_step = @route.route_steps.create!(
        route_module: @paid, position: 2, title: "Paid", status: :available
      )
    end

    test "route owner may access a preview step" do
      assert ModuleAccessPolicy.allowed?(
        user: @user, route_id: @route.id, step_id: @preview_step.id
      )
    end

    test "route owner may not access a locked module even when its step is available" do
      assert_not ModuleAccessPolicy.allowed?(
        user: @user, route_id: @route.id, step_id: @paid_step.id
      )
    end

    test "another user may not access preview content" do
      assert_not ModuleAccessPolicy.allowed?(
        user: create_test_user, route_id: @route.id, step_id: @preview_step.id
      )
    end

    test "owner role does not create customer entitlement" do
      owner = Core::User.owner.first || create_test_user(role: :owner)

      assert_not ModuleAccessPolicy.allowed?(
        user: owner, route_id: @route.id, step_id: @preview_step.id
      )
      assert_not ModuleAccessPolicy.allowed_step?(user: owner, step_id: @preview_step.id)
    end

    test "a forged route and step tuple is rejected" do
      other_profile = LearningProfile.create!(user: create_test_user, current_level: "beginner")
      other_route = LearningRoute.create!(learning_profile: other_profile, topic: "Other")

      assert_not ModuleAccessPolicy.allowed?(
        user: @user, route_id: other_route.id, step_id: @preview_step.id
      )
    end

    test "cache identity includes user route module access state and step" do
      key = ModuleAccessPolicy.cache_key(user: @user, step: @preview_step)

      assert_includes key, @user.id
      assert_includes key, @route.id
      assert_includes key, @preview.id
      assert_includes key, "preview"
      assert_includes key, @preview_step.id
      assert_not_equal key, ModuleAccessPolicy.cache_key(user: create_test_user, step: @preview_step)
      assert_not_equal key, ModuleAccessPolicy.cache_key(user: @user, step: @paid_step)
    end

    test "unknown identifiers are rejected without revealing existence" do
      assert_not ModuleAccessPolicy.allowed?(
        user: @user, route_id: SecureRandom.uuid, step_id: SecureRandom.uuid
      )
      assert_not ModuleAccessPolicy.allowed_step?(user: @user, step_id: SecureRandom.uuid)
    end
  end
end
