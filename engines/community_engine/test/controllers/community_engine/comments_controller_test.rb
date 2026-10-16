# frozen_string_literal: true

require "test_helper"
require_relative "../../community_test_helpers"

module CommunityEngine
  class CommentsControllerTest < ActionDispatch::IntegrationTest
    include CommunityTestHelpers

    setup do
      @author = community_user("Cora Commenter")
      @other = community_user("Otto Other")
      @post = Post.create!(user: @other, body: "Discuss")
    end

    test "a signed-out visitor cannot comment" do
      assert_no_difference -> { Comment.count } do
        post community_engine.comments_path, params: comment_params(@post, "Hello")
      end
      assert_redirected_to core_sign_in_path
    end

    test "a signed-in user comments on a post, notifies its owner and bumps the count" do
      sign_in_as(@author)

      assert_difference -> { Comment.count } => 1, -> { Notification.where(user: @other).count } => 1 do
        post community_engine.comments_path, params: comment_params(@post, "Nice post")
      end
      assert_response :redirect
      assert_equal @author.id, Comment.last.user_id
      assert_equal 1, Post.find(@post.id).comments_count
    end

    # simple_format sanitizes: the tag is dropped, the text stays.
    test "the rendered comment never carries the commenter's script tag" do
      sign_in_as(@author)

      post community_engine.comments_path(format: :turbo_stream),
           params: comment_params(@post, "<script>alert(1)</script>")

      assert_response :success
      assert_not_includes response.body, "<script>alert(1)"
      assert_includes response.body, "<span>alert(1)</span>"
    end

    test "an unknown commentable type is a bad request" do
      sign_in_as(@author)

      post community_engine.comments_path,
           params: { comment: { body: "x", commentable_type: "Core::User", commentable_id: @other.id } }

      assert_response :bad_request
    end

    test "nobody comments on another user's private share or learning route" do
      private_share = share_route(@other, visibility: "private")
      route = route_for(@other)
      sign_in_as(@author)

      [private_share, route].each do |target|
        assert_no_difference -> { Comment.count } do
          post community_engine.comments_path, params: comment_params(target, "Let me in")
        end
        assert_response :forbidden
      end
    end

    test "a reply's parent must belong to the same commentable" do
      foreign_parent = Comment.create!(user: @other, commentable: Post.create!(user: @other, body: "Elsewhere"), body: "Parent")
      sign_in_as(@author)

      post community_engine.comments_path,
           params: { comment: { body: "Reply", commentable_type: Post.name, commentable_id: @post.id, parent_id: foreign_parent.id } }

      assert_response :bad_request
    end

    test "the author edits their comment; another user cannot" do
      comment = Comment.create!(user: @author, commentable: @post, body: "Original")

      sign_in_as(@other)
      patch community_engine.comment_path(comment), params: { comment: { body: "Hijacked" } }
      assert_response :forbidden
      assert_equal "Original", Comment.find(comment.id).body

      switch_to(@author)
      patch community_engine.comment_path(comment), params: { comment: { body: "Edited" } }
      assert_response :redirect
      edited = Comment.find(comment.id)
      assert_equal "Edited", edited.body
      assert edited.edited?
    end

    test "the author deletes their comment; another user cannot" do
      comment = Comment.create!(user: @author, commentable: @post, body: "Delete me")

      sign_in_as(@other)
      delete community_engine.comment_path(comment)
      assert_response :forbidden
      assert Comment.exists?(comment.id)

      switch_to(@author)
      delete community_engine.comment_path(comment)
      assert_not Comment.exists?(comment.id)
      assert_equal 0, Post.find(@post.id).comments_count
    end

    private

    def comment_params(commentable, body)
      { comment: { body: body, commentable_type: commentable.class.name, commentable_id: commentable.id } }
    end
  end
end
