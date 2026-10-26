require "application_system_test_case"

# STEP 36 §3: the share image is the landing's own stage, light, at 1200×630.
# This renders it in both languages every run; OG_WRITE=1 writes the PNGs the
# pages serve as og:image, so the card is regenerated from source, never edited.
class OgCardTest < ApplicationSystemTestCase
  WIDTH, HEIGHT = 1200, 630

  %w[es en].each do |locale|
    test "the #{locale} share card renders at #{WIDTH}x#{HEIGHT} with the promise and the map" do
      out = ENV["OG_WRITE"] ? Rails.root.join("app/assets/images/og/og-#{locale}.png") : scratch_png(locale)
      shoot(locale, out)
      assert_equal [WIDTH, HEIGHT], File.binread(out)[16, 8].unpack("NN")
    end
  end

  # The browser is shared by every system test in this worker. A card left it at
  # 1200×630 and with a 2 s script timeout, and tests after it failed on CI.
  test "rendering a card leaves the browser as it found it" do
    visit "/privacy"
    before = { viewport: page.evaluate_script("[innerWidth, innerHeight]"), script_timeout: script_timeout }

    shoot("es", scratch_png("es"))

    visit "/privacy"
    assert_equal before, { viewport: page.evaluate_script("[innerWidth, innerHeight]"), script_timeout: script_timeout }
  end

  private

  def script_timeout = page.driver.browser.manage.timeouts.script_timeout

  # One file per worker process. On CI the suite runs in parallel, and two tests
  # sharing tmp/og-es.png let one worker truncate the file (save_screenshot opens
  # it "wb") while another read it: binread returned "" and [16, 8] was nil.
  def scratch_png(locale) = Rails.root.join("tmp/og-#{locale}-#{Process.pid}.png")

  # Synchronous polls, not evaluate_async_script: Capybara sets the session's
  # script timeout to default_max_wait_time for an async script and never puts
  # it back. The override is cleared even when an assertion fails.
  def shoot(locale, out)
    page.driver.browser.execute_cdp("Emulation.setDeviceMetricsOverride",
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false)
    visit "/og-card/#{locale}"

    assert_selector "html[data-theme=light]"
    assert_selector "h1", text: I18n.t("landing.hero.title", locale: locale)
    assert_selector ".lp-journey[style*='height']", visible: :all
    # The map's names are placed once the scene has drawn; the fonts must be in too.
    assert_selector ".lp-labels > *", minimum: 1, visible: :all
    # The hero's lines fade in; shoot once every entrance animation has ended.
    Timeout.timeout(10) do
      sleep 0.05 until page.evaluate_script(<<~JS)
        document.fonts.status === "loaded" &&
          document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState === "finished")
      JS
    end

    page.driver.browser.save_screenshot(out.to_s)
  ensure
    page.driver.browser.execute_cdp("Emulation.clearDeviceMetricsOverride")
  end
end
