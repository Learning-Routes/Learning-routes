# frozen_string_literal: true

require "test_helper"
require_relative "../../community_test_helpers"

module CommunityEngine
  class LikesControllerTest < ActionDispatch::IntegrationTest
    include CommunityTestHelpers

    setup do
      @liker = community_user("Lia Liker")
      @owner = community_user("Oscar Owner")
      @post = Post.create!(user: @owner, body: "Like me")
    end

    test "a signed-out visitor cannot like" do
      post community_engine.toggle_like_path, params: like_params(@post), as: :json
      assert_response :redirect
      assert_equal 0, Like.count
    end

    test "toggle likes, then unlikes, and the count follows" do
      sign_in_as(@liker)

      post community_engine.toggle_like_path(format: :json), params: like_params(@post)
      assert_response :success
      assert_equal({ "liked" => true, "likes_count" => 1 }, response.parsed_body)
      assert_equal 1, Notification.where(user: @owner, notification_type: "new_like").count

      post community_engine.toggle_like_path(format: :json), params: like_params(@post)
      assert_equal({ "liked" => false, "likes_count" => 0 }, response.parsed_body)
      assert_equal 0, Like.where(user: @liker).count
    end

    test "two users liking the same post count twice, one like each" do
      Like.create!(user: @owner, likeable: @post)
      sign_in_as(@liker)

      post community_engine.toggle_like_path(format: :json), params: like_params(@post)

      assert_equal 2, response.parsed_body["likes_count"]
      assert_equal 1, Like.where(user: @liker, likeable: @post).count
    end

    test "an unknown likeable type is a bad request" do
      sign_in_as(@liker)
      post community_engine.toggle_like_path(format: :json),
           params: { likeable_type: "Core::User", likeable_id: @owner.id }
      assert_response :bad_request
    end

    test "nobody likes another user's private share or learning route" do
      private_share = share_route(@owner, visibility: "private")
      route = route_for(@owner)
      sign_in_as(@liker)

      [private_share, route].each do |target|
        post community_engine.toggle_like_path(format: :json), params: like_params(target)
        assert_response :forbidden
      end
      assert_equal 0, Like.count
    end

    private

    def like_params(likeable)
      { likeable_type: likeable.class.name, likeable_id: likeable.id }
    end
  end
end
