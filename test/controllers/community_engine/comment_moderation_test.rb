require "test_helper"

module CommunityEngine
  class CommentModerationTest < ActionDispatch::IntegrationTest
    setup do
      @author = create_test_user(email_verified_at: Time.current)
      @post = Post.create!(user: @author, body: "A community post")
      @comment = Comment.create!(user: @author, commentable: @post, body: "A comment")
    end

    test "owner can remove another user's comment" do
      owner = create_test_user(role: :owner, email_verified_at: Time.current)
      sign_in_as(owner)

      assert_difference -> { Comment.count }, -1 do
        delete community_engine.comment_path(@comment)
      end

      assert_redirected_to "/"
    end

    test "student receives forbidden when removing another user's comment" do
      student = create_test_user(email_verified_at: Time.current)
      sign_in_as(student)

      assert_no_difference -> { Comment.count } do
        delete community_engine.comment_path(@comment)
      end

      assert_response :forbidden
    end
  end
end
