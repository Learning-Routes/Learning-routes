require "test_helper"

# STEP 39 §3, found in Step 0: the landing's ETag was locale + user, while the
# page renders the theme server-side, so a visitor who switched theme got a 304
# and kept the old one. The key covers what the page varies on, and only an
# anonymous page is cached at all.
class LandingCacheTest < ActionDispatch::IntegrationTest
  test "a theme switch on the same URL gets a new body, not a 304" do
    cookies[:theme] = "light"
    get root_path
    assert_response :success
    etag = response.headers["ETag"]
    assert etag.present?

    cookies[:theme] = "dark"
    get root_path, headers: { "If-None-Match" => etag }

    assert_response :success
    assert_match 'data-theme-preference-value="dark"', response.body
  end

  test "a locale switch on the same URL gets a new body" do
    cookies[:locale] = "es"
    get root_path
    etag = response.headers["ETag"]

    cookies[:locale] = "en"
    get root_path, headers: { "If-None-Match" => etag }

    assert_response :success
    assert_match '<html lang="en"', response.body
  end

  test "the same anonymous visitor revalidating gets a 304" do
    cookies[:theme] = "dark"
    get root_path
    get root_path, headers: { "If-None-Match" => response.headers["ETag"] }

    assert_response :not_modified
  end

  test "a signed-in landing is never cached publicly" do
    sign_in_as(create_test_user(email_verified_at: Time.current))

    get root_path

    assert_response :success
    assert_no_match(/public/, response.headers["Cache-Control"].to_s)
  end
end
