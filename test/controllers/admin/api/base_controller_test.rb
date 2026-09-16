require "test_helper"
require "support/video_lesson_helpers"

# THE CLASS: an open door.
#
# This controller does NOT use the session — the studio is a Python script on the
# owner's Mac, not a browser. That makes the token the only thing between the
# public internet and a write endpoint, so every way of getting it wrong is pinned
# here: absent, malformed, wrong, and — the one that is easy to get backwards — a
# missing credential, which must mean OFF, never open.
class Admin::Api::BaseControllerTest < ActionDispatch::IntegrationTest
  include VideoLessonHelpers

  test "no token is 401" do
    with_token(TOKEN) { get "/admin/api/routes" }
    assert_response :unauthorized
  end

  test "a wrong token is 401" do
    with_token(TOKEN) { get "/admin/api/routes", headers: auth("x" * 48) }
    assert_response :unauthorized
  end

  test "a missing credential means the API is OFF, not open" do
    with_token(nil) { get "/admin/api/routes", headers: auth(TOKEN) }
    assert_response :unauthorized,
      "with no studio.api_token configured the API must refuse everything; " \
      "an unset credential that compares equal to a supplied token is an open door"
  end

  test "the right token is accepted and audited" do
    assert_difference -> { OwnerAuditEvent.where(action: "owner.studio_api").count }, 1 do
      with_token(TOKEN) { get "/admin/api/routes", headers: auth(TOKEN) }
    end
    assert_response :success
    assert_equal "private, no-store", response.headers["Cache-Control"]
  end

  test "it never answers with a session or a redirect" do
    with_token(TOKEN) { get "/admin/api/routes", headers: auth(TOKEN) }
    assert_equal "application/json", response.media_type
  end
end
