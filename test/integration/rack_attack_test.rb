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

  test "secret-probe scanner paths are blocked with 404" do
    %w[/.env /.git/config /.aws/credentials /wp-login.php /phpmyadmin].each do |path|
      get path
      assert_response :not_found, "expected #{path} to be blocked"
    end
  end

  test "login endpoint is throttled after 5 attempts per minute per IP" do
    5.times do |i|
      post "/sign_in", params: { email: "ip-#{i}@b.com", password: "wrong" }
      assert_not_equal 429, response.status
    end
    # 6th distinct email from the same IP trips the per-IP throttle.
    post "/sign_in", params: { email: "ip-6@b.com", password: "wrong" }
    assert_response :too_many_requests
    assert response.headers["Retry-After"].present?
  end

  test "login is throttled per email across rotating IPs" do
    5.times do |i|
      post "/sign_in", params: { email: "victim@b.com", password: "wrong" },
                       headers: { "REMOTE_ADDR" => "10.0.0.#{i}" }
      assert_not_equal 429, response.status
    end
    post "/sign_in", params: { email: "victim@b.com", password: "wrong" },
                     headers: { "REMOTE_ADDR" => "10.0.0.99" }
    assert_response :too_many_requests
  end

  test "health check is never blocked or throttled" do
    get "/up"
    assert_response :success
  end
end
