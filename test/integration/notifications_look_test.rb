require "test_helper"

# STEP 41 §3.3: notifications on the foundations: a page title, and the list
# (or its empty state) on a card with body.
class NotificationsLookTest < ActionDispatch::IntegrationTest
  test "notifications is built from the foundations" do
    sign_in_as(create_test_user(email_verified_at: Time.current, locale: "es"))

    get community_engine.notifications_path

    assert_response :success
    assert_select "h1.page-title", text: I18n.t("community_engine.notifications_ui.title", locale: :es)
    assert_select ".card3", minimum: 1
  end
end
