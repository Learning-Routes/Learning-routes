# frozen_string_literal: true

require "test_helper"
require_relative "../../community_test_helpers"

module CommunityEngine
  class NotificationsControllerTest < ActionDispatch::IntegrationTest
    include CommunityTestHelpers

    setup do
      @me = community_user("Mina Me")
      @someone = community_user("Sam Someone")
      @mine = notify(@me, "Arlo Mine")
      @theirs = notify(@someone, "Theo Theirs")
    end

    test "every notification route requires a session" do
      get community_engine.notifications_path
      assert_redirected_to core_sign_in_path
      get community_engine.unread_count_notifications_path(format: :json)
      assert_response :redirect
    end

    test "index lists only my notifications" do
      sign_in_as(@me)

      get community_engine.notifications_path

      assert_response :success
      assert_includes response.body, "Arlo Mine"
      assert_not_includes response.body, "Theo Theirs"
    end

    test "unread_count counts only mine" do
      notify(@me, "Sid Second")
      sign_in_as(@me)

      get community_engine.unread_count_notifications_path(format: :json)

      assert_equal({ "count" => 2 }, response.parsed_body)
    end

    test "mark_read marks mine and is 404 for someone else's" do
      sign_in_as(@me)

      patch community_engine.mark_read_notification_path(@theirs)
      assert_response :not_found
      assert_nil Notification.find(@theirs.id).read_at

      patch community_engine.mark_read_notification_path(@mine)
      assert_response :ok
      assert_not_nil Notification.find(@mine.id).read_at
    end

    test "mark_all_read touches only mine" do
      sign_in_as(@me)

      post community_engine.mark_all_read_notifications_path

      assert_response :redirect
      assert_equal 0, Notification.where(user: @me).unread.count
      assert_equal 1, Notification.where(user: @someone).unread.count
    end

    private

    # The page shows the actor's name, so each notification gets its own actor.
    def notify(user, actor_name)
      Notification.create!(user: user, actor: community_user(actor_name), notification_type: "new_like",
                           notifiable: Post.create!(user: user, body: "Liked post"))
    end
  end
end
