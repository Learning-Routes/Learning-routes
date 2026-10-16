require "test_helper"

# STEP 39 §3, found in Step 0: the student's dashboard is the profile.
# /dashboard is only a redirect; the DashboardController it once reached had
# no route and was removed.
class DashboardRedirectTest < ActionDispatch::IntegrationTest
  test "/dashboard redirects to the profile" do
    sign_in_as(create_test_user(email_verified_at: Time.current))

    get dashboard_path

    assert_redirected_to "/profile"
    assert_equal 301, response.status
  end

  test "no controller or view is left behind the old dashboard" do
    assert_not File.exist?(Rails.root.join("app/controllers/dashboard_controller.rb"))
    assert_empty Dir[Rails.root.join("app/views/dashboard/*")]
  end
end
