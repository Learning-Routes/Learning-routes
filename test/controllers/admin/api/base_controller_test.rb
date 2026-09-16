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

  # An OUTCOME test, and it is labelled as one on purpose. It passes with
  # `authenticate_studio!`'s `expected.blank?` line DELETED — measured — because a
  # 48-byte token can never equal a 0-byte credential: `secure_compare` opens with
  # `a.bytesize == b.bytesize`. So this pins the behaviour the spec requires and
  # attributes it to nothing in particular. The test below is the one that
  # discriminates.
  test "a missing credential means the API is OFF, not open" do
    with_token(nil) { get "/admin/api/routes", headers: auth(TOKEN) }
    assert_response :unauthorized,
      "with no studio.api_token configured the API must refuse everything"
  end

  # THIS is the guard test, and it took a measurement to find the right shape.
  #
  # `ActiveSupport::SecurityUtils.secure_compare("", "")` is **true** (measured, not
  # assumed). So an unset credential really would let an empty token in — the only
  # reason it does not today is that `ActionController::HttpAuthentication::Token
  # .authenticate` wraps `login_procedure.call` in `unless token.blank?` and never
  # reaches our comparison. Two mechanisms deep, and both of them belong to Rails.
  #
  # `expected.blank?` is what holds if either one goes away: someone reading
  # `request.headers["Authorization"]` by hand, or a Rails version that stops
  # pre-filtering. That refactor is the mutation this test was proven against —
  # `Bearer token=""` parses to a real empty string, not nil (also measured).
  test "an empty token against an unset credential is 401, not a match" do
    with_token(nil) do
      get "/admin/api/routes", headers: { "Authorization" => 'Bearer token=""' }
    end

    assert_response :unauthorized,
      "an empty submitted token compares EQUAL to an unset credential " \
      "(secure_compare(\"\", \"\") is true); only `expected.blank?` refuses it"
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

  # Rack::Attack is disabled globally in test/test_helper.rb (a real cache store
  # would let its counters leak between unrelated tests), so this test enables it
  # locally with an in-memory store, mirroring test/integration/rack_attack_test.rb.
  test "the 31st request in a minute from the same token is throttled" do
    original_store = Rack::Attack.cache.store
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    Rack::Attack.enabled = true
    Rack::Attack.reset!

    with_token(TOKEN) do
      30.times do
        get "/admin/api/routes", headers: auth(TOKEN)
        assert_not_equal 429, response.status
      end
      get "/admin/api/routes", headers: auth(TOKEN)
      assert_response :too_many_requests
      assert response.headers["Retry-After"].present?

      # And it is keyed on the TOKEN, not on the IP. Every request above came from
      # one test client, so a per-IP throttle would have produced the same 429s.
      # A SECOND token from the same client must still be served — that is the
      # difference between the two keying strategies, and the same way
      # rack_attack_test.rb proves its own per-email rule.
      get "/admin/api/routes", headers: auth("y" * 48)
      assert_not_equal 429, response.status,
        "a different token from the same IP was throttled, so this rule is keyed " \
        "on the address and not on the token the spec names"
      assert_response :unauthorized, "test premise: the second token is a wrong one"
    end
  ensure
    Rack::Attack.enabled = false
    Rack::Attack.cache.store = original_store
  end
end
