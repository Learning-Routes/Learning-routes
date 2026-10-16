# frozen_string_literal: true

require "test_helper"
require_relative "../../community_test_helpers"

module CommunityEngine
  # The feed under the test environment's strict loading (mode :all, action
  # :raise — config/environments/test.rb). Production runs the same code with
  # :log (config/environments/production.rb), so a lazy load there is a silent
  # extra query per row instead of a 500.
  class FeedQueriesTest < ActionDispatch::IntegrationTest
    include CommunityTestHelpers

    setup do
      @viewer = community_user("Nadia Viewer")
      route_for(@viewer, topic: "Viewer's own route")
      sign_in_as(@viewer)
    end

    test "the feed renders posts, shares and comments from several users without a lazy load" do
      add_feed_rows(3)

      get community_engine.feed_path

      assert_response :success
      assert_includes response.body, "Post body 2"
      assert_includes response.body, "Shared topic 2"
    end

    # A query per row grows by at least one per added row. The count is not
    # exactly constant: a preload skips its query when every record it needs is
    # already loaded, and which ones are depends on the rows (measured: +2
    # between 3 and 9 rows), so the bound is "fewer than one per row".
    test "the feed's query count does not grow with each added post and share" do
      add_feed_rows(3)
      baseline = feed_query_count

      add_feed_rows(6, offset: 3)

      growth = feed_query_count - baseline
      assert_operator growth, :<, 6, "6 more rows cost #{growth} more queries — a query runs per row"
    end

    private

    def add_feed_rows(count, offset: 0)
      count.times do |i|
        n = offset + i
        author = community_user("Author #{n}")
        commenter = community_user("Commenter #{n}")
        post = Post.create!(user: author, body: "Post body #{n}")
        Comment.create!(user: commenter, commentable: post, body: "Reply to post #{n}")
        Like.create!(user: @viewer, likeable: post)
        shared = share_route(author, route_for(author, topic: "Shared topic #{n}"), description: "Description #{n}")
        Comment.create!(user: commenter, commentable: shared, body: "Thought on share #{n}")
        Rating.create!(user: commenter, shared_route: shared, score: 4)
      end
    end

    # The same counter assert_queries_count uses, so the two numbers compare.
    def feed_query_count
      ActiveRecord::Base.lease_connection.materialize_transactions
      counter = ActiveRecord::Assertions::QueryAssertions::SQLCounter.new
      ActiveSupport::Notifications.subscribed(counter, "sql.active_record") { get community_engine.feed_path }
      assert_response :success
      counter.log.size
    end
  end
end
