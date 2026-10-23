require "application_system_test_case"

# STEP 36 §3: the share image is the landing's own stage, light, at 1200×630.
# This renders it in both languages every run; OG_WRITE=1 writes the PNGs the
# pages serve as og:image, so the card is regenerated from source, never edited.
class OgCardTest < ApplicationSystemTestCase
  WIDTH, HEIGHT = 1200, 630

  %w[es en].each do |locale|
    test "the #{locale} share card renders at #{WIDTH}x#{HEIGHT} with the promise and the map" do
      page.driver.browser.execute_cdp("Emulation.setDeviceMetricsOverride",
        width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false)
      visit "/og-card/#{locale}"

      assert_selector "html[data-theme=light]"
      assert_selector "h1", text: I18n.t("landing.hero.title", locale: locale)
      assert_selector ".lp-journey[style*='height']", visible: :all
      # The map's names are placed once the scene has drawn; the fonts must be in too.
      assert_selector ".lp-labels > *", minimum: 1, visible: :all
      assert page.evaluate_async_script("document.fonts.ready.then(() => arguments[0](true))")
      # The hero's lines fade in; shoot once every entrance animation has ended.
      finished = page.evaluate_async_script(<<~JS)
        const done = arguments[0]
        Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished))
          .then(() => done(true), () => done(false))
      JS
      assert finished, "an entrance animation was cancelled before the shot"

      out = ENV["OG_WRITE"] ? Rails.root.join("app/assets/images/og/og-#{locale}.png") : Rails.root.join("tmp/og-#{locale}.png")
      page.driver.browser.save_screenshot(out.to_s)
      png = File.binread(out)
      assert_equal [WIDTH, HEIGHT], png[16, 8].unpack("NN")
    end
  end
end
