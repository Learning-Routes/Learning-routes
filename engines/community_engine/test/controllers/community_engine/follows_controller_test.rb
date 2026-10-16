# frozen_string_literal: true

require "test_helper"
require_relative "../../community_test_helpers"

module CommunityEngine
  class FollowsControllerTest < ActionDispatch::IntegrationTest
    include CommunityTestHelpers

    setup do
      @follower = community_user("Felix Follower")
      @followed = community_user("Greta Followed")
    end

    test "a signed-out visitor cannot follow" do
      post community_engine.follows_path, params: { followed_id: @followed.id }
      assert_redirected_to core_sign_in_path
      assert_equal 0, Follow.count
    end

    test "following creates one follow, counts it and notifies; a repeat is a no-op" do
      sign_in_as(@follower)

      2.times { post community_engine.follows_path, params: { followed_id: @followed.id } }

      assert_response :redirect
      assert_equal 1, Follow.where(follower: @follower, followed: @followed).count
      assert_equal 1, Core::User.find(@followed.id).followers_count
      assert_equal 1, Core::User.find(@follower.id).following_count
      assert_equal 1, Notification.where(user: @followed, notification_type: "new_follower").count
    end

    test "nobody follows themselves" do
      sign_in_as(@follower)
      post community_engine.follows_path, params: { followed_id: @follower.id }
      assert_response :unprocessable_entity
      assert_equal 0, Follow.count
    end

    test "following an unknown user is 404" do
      sign_in_as(@follower)
      post community_engine.follows_path, params: { followed_id: 0 }
      assert_response :not_found
    end

    test "unfollow removes only your own follow" do
      Follow.create!(follower: @follower, followed: @followed)
      bystander = community_user("Bea Bystander")
      sign_in_as(bystander)

      delete community_engine.follow_path(@followed.id)
      assert_response :not_found
      assert Follow.exists?(follower: @follower, followed: @followed)

      switch_to(@follower)
      delete community_engine.follow_path(@followed.id)
      assert_response :redirect
      assert_not Follow.exists?(follower: @follower, followed: @followed)
      assert_equal 0, Core::User.find(@followed.id).followers_count
    end
  end
end
