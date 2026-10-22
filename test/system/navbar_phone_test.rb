require "application_system_test_case"

# Reviewer, 22 Oct: at 390 the signed-in navbar wrapped "Learning Routes" onto
# two lines with "Inicio" on top of it: the desktop links carried an inline
# display:flex that beat Tailwind's `hidden`. At a phone's width no item in
# the bar overlaps another, signed in or out.
class NavbarPhoneTest < ApplicationSystemTestCase
  OVERLAPS = <<~JS.freeze
    (() => {
      const nav = document.querySelector(arguments[0]);
      const shown = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.opacity !== "0" && r.bottom <= nav.getBoundingClientRect().bottom + 1; };
      const items = [...nav.querySelectorAll("a, button, [data-nav] span")].filter(shown)
        .filter((el, _, all) => !all.some((o) => o !== el && el.contains(o)));
      const out = [];
      items.forEach((a, i) => items.slice(i + 1).forEach((b) => {
        if (a.contains(b) || b.contains(a)) return;
        const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
        if (r.left < q.right - 1 && q.left < r.right - 1 && r.top < q.bottom - 1 && q.top < r.bottom - 1)
          out.push(a.textContent.trim().slice(0, 20) + " × " + b.textContent.trim().slice(0, 20));
      }));
      // A block's box is one rect however many lines it holds: count the text's lines.
      const brand = nav.querySelector("[data-nav='logo'] span");
      if (brand) {
        const range = document.createRange(); range.selectNodeContents(brand);
        const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        if (lines > 1) out.push("the brand wraps onto " + lines + " lines");
      }
      return out;
    })()
  JS

  def setup
    @user = Core::User.create!(name: "Ana Prueba", email: "nav-#{SecureRandom.hex(4)}@example.com", password: "password123",
                               password_confirmation: "password123", email_verified_at: Time.current, locale: "es")
    LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    page.driver.browser.execute_cdp("Emulation.setDeviceMetricsOverride", width: 390, height: 844, deviceScaleFactor: 1, mobile: true)
  end

  def teardown
    page.driver.browser.execute_cdp("Emulation.clearDeviceMetricsOverride")
  end

  test "signed out at 390, the shared navbar's items never overlap" do
    visit terms_path
    assert_empty page.evaluate_script(OVERLAPS, "nav[data-controller='navbar']")
  end

  test "signed in at 390, the app navbar's items never overlap" do
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    find("form[action='#{core.sign_in_path}'] [type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5

    [profile_path, community_engine.feed_path].each do |path|
      visit path
      assert_empty page.evaluate_script(OVERLAPS, ".app-navbar"), "on #{path}"
    end
  end
end
