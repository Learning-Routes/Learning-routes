# frozen_string_literal: true

require "test_helper"
require_relative "../../community_test_helpers"

module CommunityEngine
  class FeedControllerTest < ActionDispatch::IntegrationTest
    include CommunityTestHelpers

    setup do
      @viewer = community_user("Vera Viewer")
      @author = community_user("Abel Author")
    end

    test "every feed route redirects a signed-out visitor to sign in" do
      [community_engine.feed_path, community_engine.feed_following_path, community_engine.feed_trending_path].each do |path|
        get path
        assert_redirected_to core_sign_in_path, "#{path} must require a session"
      end
    end

    test "index shows posts and public shares, never another user's private or unlisted share" do
      Post.create!(user: @author, body: "Public musing about borrow checkers")
      share_route(@author, route_for(@author, topic: "Open topic"), description: "Open description")
      share_route(@author, route_for(@author, topic: "Hidden topic"), visibility: "private", description: "Private plan")
      share_route(@author, route_for(@author, topic: "Link-only topic"), visibility: "unlisted", description: "Unlisted plan")
      sign_in_as(@viewer)

      get community_engine.feed_path

      assert_response :success
      assert_includes response.body, "Public musing about borrow checkers"
      assert_includes response.body, "Open description"
      assert_not_includes response.body, "Private plan"
      assert_not_includes response.body, "Hidden topic"
      assert_not_includes response.body, "Unlisted plan"
    end

    test "floating thoughts never quote a comment on a private share" do
      private_share = share_route(@author, visibility: "private")
      Comment.create!(user: @author, commentable: private_share, body: "Note to self about the private route")
      sign_in_as(@viewer)

      get community_engine.feed_path

      assert_response :success
      assert_not_includes response.body, "Note to self about the private route"
    end

    test "the following tab lists only shares by followed users" do
      followed = community_user("Fiona Followed")
      Follow.create!(follower: @viewer, followed: followed)
      share_route(followed, route_for(followed, topic: "Followed topic"), description: "From someone I follow")
      share_route(@author, route_for(@author, topic: "Stranger topic"), description: "From a stranger")
      sign_in_as(@viewer)

      get community_engine.feed_path(tab: "following")
      assert_response :success
      assert_includes response.body, "From someone I follow"
      assert_not_includes response.body, "From a stranger"

      get community_engine.feed_following_path
      assert_response :success
      assert_includes response.body, "From someone I follow"
      assert_not_includes response.body, "From a stranger"
    end

    test "the trending tab lists public shares only" do
      share_route(@author, route_for(@author, topic: "Trending public topic"))
      share_route(@author, route_for(@author, topic: "Trending private topic"), visibility: "private")
      sign_in_as(@viewer)

      get community_engine.feed_path(tab: "trending")
      assert_response :success
      assert_includes response.body, "Trending public topic"
      assert_not_includes response.body, "Trending private topic"

      get community_engine.feed_trending_path
      assert_response :success
      assert_includes response.body, "Trending public topic"
      assert_not_includes response.body, "Trending private topic"
    end
  end
end
