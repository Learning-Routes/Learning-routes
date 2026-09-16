require "test_helper"
require "support/video_lesson_helpers"

# THE TREE: what the studio walks to choose a step to publish a video onto.
#
# Field names are the Python client's contract (spec §6) — not ours to improve.
# Every request goes through with_token because the test environment carries no
# studio.api_token credential, so an unwrapped request would 401 before it ever
# reached the serializer.
class Admin::Api::RoutesControllerTest < ActionDispatch::IntegrationTest
  include VideoLessonHelpers

  ROUTE_KEYS = %w[id title level modules].freeze
  STEP_KEYS  = %w[id position title description estimated_minutes has_video video].freeze

  test "the tree exposes exactly the agreed fields and nothing else" do
    step_with_sections([{ "type" => "concept", "body" => "x" }])

    with_token(TOKEN) { get "/admin/api/routes", headers: auth(TOKEN) }
    route = JSON.parse(response.body).first

    assert_equal ROUTE_KEYS.sort, route.keys.sort
    assert_equal STEP_KEYS.sort, route["modules"].first["steps"].first.keys.sort,
      "a step in this tree must never carry metadata, a lesson body or user data"
  end

  test "it never serialises metadata or a lesson body" do
    step_with_sections([{ "type" => "concept", "body" => "x" }])

    with_token(TOKEN) { get "/admin/api/routes", headers: auth(TOKEN) }

    assert_not_includes response.body, "parsed_sections"
    assert_not_includes response.body, "audio_sections"
  end
end
