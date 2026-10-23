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
    visit "/"
    assert_equal [], page_views

    find("footer a", text: I18n.t("landing.footer.terms")).click
    assert_current_path "/terms"
    assert_equal ["#{page.server_url}/terms"], page_views

    find("a[data-nav=logo]", match: :first).click
    assert_current_path "/"
    assert_equal ["#{page.server_url}/terms", "#{page.server_url}/"], page_views
    assert_equal %w[public public], page_areas, "each Turbo visit carries its page's area"
    assert page.evaluate_script("performance.getEntriesByType('navigation').length == 1 && window.dataLayer.filter((e) => e.event === 'gtm.js').length == 1"),
      "the Turbo visits reloaded the page or loaded GTM a second time"
  end
end
