require "test_helper"

# STEP 41 §2 removed the landing's #features and #how-it-works sections. The
# shared navbar (terms, privacy, and the app's pages when signed out) pointed at both, in the
# desktop bar and the mobile menu. "How it works" now goes to the landing's
# map (/#como); there is no features section to link to.
class NavbarLandingAnchorsTest < ActionDispatch::IntegrationTest
  test "signed out on the terms page, both menus link how it works to the map and nothing to the old sections" do
    get terms_path

    assert_how_it_works_in_both_menus
  end

  # Signed in, the app's pages use shared/app_navbar; terms and privacy keep this one.
  test "signed in on the privacy page, both menus link how it works to the map and nothing to the old sections" do
    sign_in_as(create_test_user(email_verified_at: Time.current))
    get privacy_path

    assert_how_it_works_in_both_menus
  end

  private

  def assert_how_it_works_in_both_menus
    assert_response :success
    assert_select "nav[data-controller='navbar']" do
      assert_select "a[href='#features'], a[href='#how-it-works']", count: 0
      assert_select "a[href=?]", root_path(anchor: "como"), count: 2, text: I18n.t("nav.how_it_works")
      assert_select "#navbar-mobile-menu a[href=?]", root_path(anchor: "como"), count: 1
    end
  end
end
