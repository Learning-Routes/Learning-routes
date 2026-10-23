require "application_system_test_case"

# A Turbo visit swaps the body without a page load, so GTM's own page view fires
# once per full load only. Each Turbo visit after it pushes one `turbo_page_view`;
# the first load pushes none (gtm.js counts that one). Each carries the page's
# area, which a Turbo visit can change.
class GoogleTagManagerTurboTest < ApplicationSystemTestCase
  setup do
    @previous = Rails.configuration.x.gtm_id
    # An id no container answers to: gtm.js 404s and only the page's own pushes remain.
    Rails.configuration.x.gtm_id = "GTM-TEST000"
  end

  teardown { Rails.configuration.x.gtm_id = @previous }

  def page_views = page.evaluate_script("window.dataLayer.filter((e) => e.event === 'turbo_page_view').map((e) => e.page_location)")
  def page_areas = page.evaluate_script("window.dataLayer.filter((e) => e.event === 'turbo_page_view').map((e) => e.page_area)")

  test "the first load pushes no Turbo page view and each Turbo visit pushes exactly one" do
    visit "/privacy"
    assert_equal [], page_views

    find("a[data-nav=logo]", match: :first).click
    assert_current_path "/"
    assert_equal ["#{page.server_url}/"], page_views

    find(".lp-nav a", text: I18n.t("landing.nav.sign_in")).click
    assert_current_path "/sign_in"
    assert_equal ["#{page.server_url}/", "#{page.server_url}/sign_in"], page_views
    assert_equal %w[public public], page_areas, "each Turbo visit carries its page's area"
    assert page.evaluate_script("performance.getEntriesByType('navigation').length == 1 && window.dataLayer.filter((e) => e.event === 'gtm.js').length == 1"),
      "the Turbo visits reloaded the page or loaded GTM a second time"
  end

  test "a Turbo visit from the app to a public page carries the new page's area" do
    student = create_test_user(email_verified_at: Time.current)
    visit "/sign_in"
    fill_in "email", with: student.email
    fill_in "password", with: "password123"
    find("input[type='submit']").click
    assert_current_path "/profile"
    assert_equal [], page_views

    find("a[data-nav=logo]", match: :first).click
    assert_current_path "/"
    assert_equal %w[public], page_areas
  end
end
