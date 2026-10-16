# frozen_string_literal: true

require "test_helper"
require_relative "../../community_test_helpers"

module CommunityEngine
  class SharedRoutesControllerTest < ActionDispatch::IntegrationTest
    include CommunityTestHelpers

    setup do
      @sharer = community_user("Sara Sharer")
      @cloner = community_user("Cleo Cloner")
      @route = route_for(@sharer, topic: "Postgres internals", steps: 3)
    end

    test "create shares your own route" do
      sign_in_as(@sharer)

      assert_difference -> { SharedRoute.count }, 1 do
        post community_engine.shared_routes_path(format: :json),
             params: { learning_route_id: @route.id, visibility: "public", description: "Mine" }
      end
      assert_response :success
      shared = SharedRoute.find_by!(share_token: response.parsed_body["share_token"])
      assert_equal [@sharer.id, @route.id], [shared.user_id, shared.learning_route_id]
    end

    test "create refuses someone else's route" do
      route_for(@cloner)
      sign_in_as(@cloner)

      assert_no_difference -> { SharedRoute.count } do
        post community_engine.shared_routes_path(format: :json), params: { learning_route_id: @route.id }
      end
      assert_response :forbidden
    end

    test "a public share renders without a session and escapes its description" do
      shared = share_route(@sharer, @route, description: "<img src=x onerror=alert(1)> read this")

      get community_engine.shared_route_path(shared.share_token)

      assert_response :success
      assert_includes response.body, "Postgres internals"
      assert_includes response.body, "read this"
      assert_not_includes response.body, "onerror=alert(1)"
    end

    test "a private share is 404 for anyone but its sharer" do
      shared = share_route(@sharer, @route, visibility: "private")

      get community_engine.shared_route_path(shared.share_token)
      assert_response :not_found

      sign_in_as(@cloner)
      get community_engine.shared_route_path(shared.share_token)
      assert_response :not_found

      switch_to(@sharer)
      get community_engine.shared_route_path(shared.share_token)
      assert_response :success
    end

    test "an unknown token is 404" do
      get community_engine.shared_route_path("no-such-token")
      assert_response :not_found
    end

    test "clone requires a session" do
      shared = share_route(@sharer, @route)

      post community_engine.clone_shared_route_path(shared.share_token)

      assert_redirected_to core_sign_in_path
      assert_equal 1, LearningRoutesEngine::LearningRoute.count
    end

    test "clone copies the route into the cloner's profile and leaves the original alone" do
      shared = share_route(@sharer, @route)
      original_steps = step_rows(@route)
      sign_in_as(@cloner)

      post community_engine.clone_shared_route_path(shared.share_token)

      copy = LearningRoutesEngine::LearningRoute.joins(:learning_profile)
        .find_by!(learning_routes_engine_learning_profiles: { user_id: @cloner.id })
      assert_redirected_to learning_routes_engine.route_path(copy)
      assert_equal "Postgres internals", copy.topic
      assert_equal original_steps.map(&:first), step_rows(copy).map(&:first)
      assert_equal original_steps, step_rows(@route), "the original's steps changed"
      assert_equal 1, SharedRoute.find(shared.id).clones_count
    end

    # A purchased module on the original must not arrive purchased on the copy.
    test "clone gives the copy its own modules and never carries the sharer's purchase" do
      paid = LearningRoutesEngine::RouteModule.create!(learning_route: @route, position: 2, title: "Deep dive",
                                                      access_state: :purchased, generation_state: :ready)
      LearningRoutesEngine::RouteStep.create!(learning_route: @route, route_module: paid, title: "Paid step", position: 3)
      shared = share_route(@sharer, @route)
      sign_in_as(@cloner)

      post community_engine.clone_shared_route_path(shared.share_token)

      copy = LearningRoutesEngine::LearningRoute.joins(:learning_profile)
        .find_by!(learning_routes_engine_learning_profiles: { user_id: @cloner.id })
      modules = LearningRoutesEngine::RouteModule.where(learning_route_id: copy.id).order(:position)
      assert_equal [[1, "preview"], [2, "locked"]], modules.map { |m| [m.position, m.access_state] }
      assert_equal "Deep dive", modules.last.title
      paid_copy = LearningRoutesEngine::RouteStep.find_by!(learning_route_id: copy.id, title: "Paid step")
      assert_equal modules.last.id, paid_copy.route_module_id
      assert_equal "purchased", LearningRoutesEngine::RouteModule.find(paid.id).access_state
    end

    test "a private share cannot be cloned" do
      shared = share_route(@sharer, @route, visibility: "private")
      sign_in_as(@cloner)

      post community_engine.clone_shared_route_path(shared.share_token)

      assert_response :forbidden
    end

    test "only the sharer unshares" do
      shared = share_route(@sharer, @route)

      sign_in_as(@cloner)
      delete community_engine.shared_route_path(shared.share_token)
      assert_response :not_found
      assert SharedRoute.exists?(shared.id)

      switch_to(@sharer)
      delete community_engine.shared_route_path(shared.share_token)
      assert_response :redirect
      assert_not SharedRoute.exists?(shared.id)
      assert LearningRoutesEngine::LearningRoute.exists?(@route.id), "unsharing must not delete the route"
    end

    private

    def step_rows(route)
      LearningRoutesEngine::RouteStep.where(learning_route_id: route.id).order(:position)
        .pluck(:title, :position, :status)
    end
  end
end
