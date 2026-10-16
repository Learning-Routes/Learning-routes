# frozen_string_literal: true

require "test_helper"
require_relative "../../community_test_helpers"

module CommunityEngine
  class PostsControllerTest < ActionDispatch::IntegrationTest
    include CommunityTestHelpers

    setup do
      @owner = community_user("Olga Owner")
      @other = community_user("Omar Other")
    end

    test "a signed-out visitor cannot post" do
      assert_no_difference -> { Post.count } do
        post community_engine.posts_path, params: { post: { body: "Anonymous" } }
      end
      assert_redirected_to core_sign_in_path
    end

    test "a signed-in user creates a post as themselves" do
      sign_in_as(@owner)

      assert_difference -> { Post.count }, 1 do
        post community_engine.posts_path, params: { post: { body: "First post", user_id: @other.id } }
      end
      assert_redirected_to community_engine.feed_path
      assert_equal @owner.id, Post.last.user_id
    end

    test "an empty post is rejected" do
      sign_in_as(@owner)

      assert_no_difference -> { Post.count } do
        post community_engine.posts_path, params: { post: { body: "" } }
      end
      assert_redirected_to community_engine.feed_path
    end

    test "the owner deletes their post, and its comments and likes go with it" do
      target = Post.create!(user: @owner, body: "Short-lived")
      top = Comment.create!(user: @other, commentable: target, body: "Top")
      Comment.create!(user: @owner, commentable: target, parent: top, body: "Reply")
      Like.create!(user: @other, likeable: target)
      sign_in_as(@owner)

      delete community_engine.post_path(target)

      assert_redirected_to community_engine.feed_path
      assert_not Post.exists?(target.id)
      assert_equal 0, Comment.where(commentable_type: Post.name, commentable_id: target.id).count
      assert_equal 0, Like.where(likeable_type: Post.name, likeable_id: target.id).count
    end

    # Not a 403/404: the controller redirects with an alert. The post survives.
    test "another user cannot delete the post" do
      target = Post.create!(user: @owner, body: "Mine")
      sign_in_as(@other)

      delete community_engine.post_path(target)

      assert_redirected_to community_engine.feed_path
      assert Post.exists?(target.id)
    end
  end
end
