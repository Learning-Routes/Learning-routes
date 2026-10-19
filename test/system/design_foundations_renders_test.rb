require "application_system_test_case"

# STEP 41 §1.4: the foundations' renders, next to the reference. Test data only.
# `SCREENSHOT=1 SCREENSHOT_PREFIX=after- bin/rails test test/system/design_foundations_renders_test.rb`
# writes tmp/redesign/pr4/<prefix><part>-<theme>-<width>.png.
class DesignFoundationsRendersTest < ApplicationSystemTestCase
  TITLES = ["Saludos formales e informales", "Números del uno al cien", "Ser y estar",
            "Pedir direcciones", "En el restaurante", "El pretérito perfecto", "De compras"].freeze

  def setup
    @user = Core::User.create!(
      name: "Ana Prueba", email: "renders-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués para viajar", locale: "es", status: :active, current_step: 2
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
    TITLES.each_with_index do |title, i|
      route.route_steps.create!(
        route_module: preview, title: title, position: i, status: i < 2 ? :completed : (i == 2 ? :available : :locked),
        content_type: :lesson, level: :nv1, bloom_level: 1, estimated_minutes: 8
      )
    end
    CommunityEngine::Post.create!(user: @user, body: "Hoy terminé el módulo de saludos. ¿Alguien practica conmigo?")
  end

  def teardown
    page.driver.browser.execute_cdp("Emulation.clearDeviceMetricsOverride")
  end

  test "renders of the foundations" do
    skip "SCREENSHOT=1 to write the renders" unless ENV["SCREENSHOT"]

    [[1440, 1000], [390, 844]].each do |width, height|
      page.driver.browser.execute_cdp("Emulation.setDeviceMetricsOverride",
                                      width: width, height: height, deviceScaleFactor: 1, mobile: width < 700)
      %w[light dark].each do |theme|
        shots(theme, width)
      end
    end
  end

  private

  def shots(theme, width)
    Capybara.reset_sessions!
    visit root_path
    set_theme(theme)
    shoot("landing-navbar", theme, width, "nav")
    shoot("footer", theme, width, "footer")

    visit core.sign_in_path
    set_theme(theme)
    shoot("auth-card", theme, width, ".auth-card")

    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5

    visit profile_path
    set_theme(theme)
    shoot("app-navbar", theme, width, ".app-navbar")
    shoot("route-card", theme, width, "a[href*='/journey']")
    shoot("create-route-card", theme, width, ".create-route-card")

    visit community_engine.feed_path
    set_theme(theme)
    shoot("feed-card", theme, width, ".feed-card")
  end

  def set_theme(theme)
    page.execute_script("document.documentElement.setAttribute('data-theme', arguments[0])", theme)
    sleep 0.5
  end

  def shoot(part, theme, width, selector)
    assert_selector selector, match: :first
    rect = page.evaluate_script(<<~JS)
      (() => { const el = document.querySelector(#{selector.to_json}); el.scrollIntoView({ block: "center" })
        const b = el.getBoundingClientRect(); const pad = 16
        return [Math.max(0, b.left - pad) + scrollX, Math.max(0, b.top - pad) + scrollY,
                Math.min(innerWidth, b.width + pad * 2), b.height + pad * 2] })()
    JS
    sleep 0.3
    png = page.driver.browser.execute_cdp("Page.captureScreenshot", format: "png", captureBeyondViewport: true,
                                          clip: { x: rect[0], y: rect[1], width: rect[2], height: rect[3], scale: 1 })
    dir = Rails.root.join("tmp/redesign/pr4")
    FileUtils.mkdir_p(dir)
    File.binwrite(dir.join("#{ENV.fetch('SCREENSHOT_PREFIX', '')}#{part}-#{theme}-#{width}.png"), Base64.decode64(png["data"]))
  end
end
