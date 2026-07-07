# frozen_string_literal: true

require "test_helper"

# Rack::Attack is disabled in the test environment's cache (null_store) by
# default, so we enable it with a real in-memory store for these checks.
class RackAttackTest < ActionDispatch::IntegrationTest
  setup do
    @original_store = Rack::Attack.cache.store
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    Rack::Attack.enabled = true
    Rack::Attack.reset!
  end

  teardown do
    Rack::Attack.enabled = false
    Rack::Attack.cache.store = @original_store
  end

  test "secret-probe scanner paths are blocked with 403" do
    %w[/.env /.git/config /.aws/credentials /wp-login.php /phpmyadmin].each do |path|
      get path
      assert_response :forbidden, "expected #{path} to be blocked"
    end
  end

  test "login endpoint is throttled after 5 attempts per minute" do
    5.times do
      post "/sign_in", params: { email: "a@b.com", password: "wrong" }
      assert_not_equal 429, response.status
    end
    post "/sign_in", params: { email: "a@b.com", password: "wrong" }
    assert_response :too_many_requests
    assert response.headers["Retry-After"].present?
  end

  test "health check is never blocked or throttled" do
    get "/up"
    assert_response :success
  end
end
