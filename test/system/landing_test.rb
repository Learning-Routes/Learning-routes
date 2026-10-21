require "application_system_test_case"

# STEP 41 §2.6. The landing is the annotated map: six texts in reading order,
# a canvas when WebGL is there, chapters reachable from the keyboard, and a
# closing sheet whose field carries the topic to the wizard.
#
# `SCREENSHOT=1 bin/rails test test/system/landing_test.rb` writes the renders
# (chapters 0–5 and the closing × light/dark × 1440/1280/390) to tmp/redesign/landing/.
class LandingTest < ApplicationSystemTestCase
  CHAPTERS = %w[c1 c2 c3 c4 c5].freeze
  PROVIDERS = /\b(OpenAI|GPT|ChatGPT|ElevenLabs|Claude|Anthropic|Gemini|Mistral|Llama)\b/

  def teardown
    page.driver.browser.execute_cdp("Emulation.setEmulatedMedia", features: [])
    page.driver.browser.execute_cdp("Emulation.clearDeviceMetricsOverride")
  end

  %w[es en].each do |locale|
    test "#{locale}: the hero and the five chapters render as text, with no provider and no 4.8" do
      visit_landing(locale: locale)

      assert_selector "h1", text: I18n.t("landing.hero.title", locale: locale), visible: :all
      assert_text :all, I18n.t("landing.hero.line", locale: locale)
      CHAPTERS.each do |c|
        assert_selector ".lp-ann h2", text: I18n.t("landing.chapters.#{c}.title", locale: locale), visible: :all
        assert_text :all, I18n.t("landing.chapters.#{c}.body", locale: locale)
      end
      text = page.text(:all)
      assert_no_match PROVIDERS, text, "the landing names an AI provider"
      assert_not_includes text, "4.8"
    end
  end

  test "the canvas mounts and every chapter's text sits clear of the map" do
    visit_landing

    assert_selector ".lp-journey:not(.lp-no-gl)"
    assert_selector ".lp-ann[data-lay]", count: 6, visible: :all, wait: 15
    assert page.evaluate_script("document.querySelector('.lp-world').width > 0")
    lays = page.evaluate_script("[...document.querySelectorAll('.lp-ann')].map((a) => JSON.parse(a.dataset.lay))")
    lays.each_with_index { |lay, i| assert_equal 0, lay["hits"], "chapter #{i} overlaps the map: #{lay.inspect}" }
  end

  test "with reduced motion, chapter 2's text is visible after one jump" do
    reduce_motion
    visit_landing
    assert_selector ".lp-ann[data-lay]", count: 6, visible: :all, wait: 15

    page.execute_script("window.scrollTo(0, 0)")
    find(".lp-vdots button[aria-label='#{I18n.t('landing.chapters.c2.title', locale: :es)}']", visible: :all).execute_script("this.click()")

    chapter = find(".lp-ann[data-ch='2']", visible: :all)
    assert_selector ".lp-ann.lp-on[data-ch='2']", visible: :all, wait: 5
    assert_equal "1", chapter.evaluate_script("getComputedStyle(this).opacity")
    assert_selector ".lp-ann.lp-on", count: 1, visible: :all
  end

  test "inactive chapters keep their links out of the tab order" do
    visit_landing
    assert_selector ".lp-ann[data-lay]", count: 6, visible: :all, wait: 15

    assert_equal "-1", find(".lp-ann[data-ch='5'] a", visible: :all)["tabindex"]
    assert_equal "true", find(".lp-world", visible: :all)["aria-hidden"]
  end

  test "an idea fills the field" do
    visit_landing
    idea = I18n.t("landing.close.ideas", locale: :es)[1]

    find(".lp-ideas button", text: idea).click

    assert_field "lp-want", with: idea
  end

  test "signed in, asking carries the topic to the wizard" do
    user = Core::User.create!(name: "Ana", email: "ana-#{SecureRandom.hex(4)}@example.com", password: "password123",
                              password_confirmation: "password123", email_verified_at: Time.current, locale: "es")
    sign_in(user)
    visit_landing(sign_in: false)

    ask "Guitarra para empezar"

    assert_current_path(/\A#{Regexp.escape(new_route_wizard_path)}/, wait: 10)
    assert_equal "Guitarra para empezar", find("input[data-route-wizard-target='customInput']").value
  end

  test "signed out, asking goes through sign-up and email verification to the wizard with the topic" do
    visit_landing

    ask "Finanzas personales"

    assert_current_path(/\A#{Regexp.escape(core.sign_up_path)}/, wait: 10)
    assert_selector "form[action='#{core.sign_up_path}'] input[name='user[name]']"
    fill_in "user[name]", with: "Nuevo"
    fill_in "user[email]", with: "nuevo-#{SecureRandom.hex(4)}@example.com"
    fill_in "user[password]", with: "password123"
    find("form[action='#{core.sign_up_path}'] [type='submit']").click
    assert_current_path core.verify_pending_path, wait: 10

    visit core.verify_email_path(Core::User.order(:created_at).last.generate_token_for(:email_verification))

    assert_current_path(/\A#{Regexp.escape(new_route_wizard_path)}/, wait: 10)
    assert_equal "Finanzas personales", find("input[data-route-wizard-target='customInput']").value
  end

  test "renders for the owner" do
    skip "SCREENSHOT=1 to write the renders" unless ENV["SCREENSHOT"]

    dir = Rails.root.join("tmp/redesign/landing")
    FileUtils.mkdir_p(dir)
    reduce_motion
    [[1440, 900], [1280, 720], [390, 844]].each do |w, h|
      %w[light dark].each do |theme|
        viewport(w, h)
        visit_landing
        page.execute_script("document.documentElement.setAttribute('data-theme', #{theme.to_json})")
        assert_selector ".lp-ann[data-lay]", count: 6, visible: :all, wait: 15
        6.times do |i|
          jump_to(i)
          page.save_screenshot(dir.join("app-ch#{i}-#{theme}-#{w}.png").to_s)
        end
        page.execute_script("document.getElementById('empezar').scrollIntoView()")
        sleep 0.4
        page.save_screenshot(dir.join("app-close-#{theme}-#{w}.png").to_s)
      end
    end
  end

  private

  def visit_landing(locale: "es", sign_in: false)
    visit root_path
    page.driver.browser.manage.add_cookie(name: "locale", value: locale)
    visit root_path
    assert_selector ".lp-journey"
  end

  def sign_in(user)
    visit core.sign_in_path
    fill_in "email", with: user.email
    fill_in "password", with: "password123"
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
  end

  def ask(topic)
    page.execute_script("document.getElementById('empezar').scrollIntoView()")
    fill_in "lp-want", with: topic
    click_button I18n.t("landing.close.button", locale: :es)
  end

  def reduce_motion
    page.driver.browser.execute_cdp("Emulation.setEmulatedMedia", features: [{ name: "prefers-reduced-motion", value: "reduce" }])
  end

  def viewport(width, height)
    page.driver.browser.execute_cdp("Emulation.setDeviceMetricsOverride", width: width, height: height,
                                    deviceScaleFactor: 1, mobile: width < 700)
  end

  # The chapter at rest: the middle of its scroll span (reduced motion snaps there).
  def jump_to(i)
    page.execute_script(<<~JS)
      (() => { const el = document.querySelector('.lp-journey'), w = [1.1, 1.5, 1.6, 1.5, 1.8, 1.4], sh = innerHeight - 64;
        const top = el.getBoundingClientRect().top + scrollY - 64; let y = 0; for (let k = 0; k < #{i}; k++) y += w[k];
        scrollTo(0, top + (y + #{i.zero? ? 0 : 0.5} * w[#{i}]) * sh) })()
    JS
    sleep 0.8
  end
end
