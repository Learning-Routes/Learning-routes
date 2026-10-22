require "test_helper"

# STEP 41 §3.3 (a reviewer's leftover): shared/_navbar, the bar on terms, privacy
# and the app's pages signed out, still had the old look: 0.8rem muted links on
# a bar with no ground. It is the reference's bar, as on the landing: a 64px
# ground of the page's colour with a hairline, the brand at the bar's weight,
# links you can read and press, the main action a .btn3.
class SiteNavbarLookTest < ActionDispatch::IntegrationTest
  test "signed out on terms, the bar is the reference's: brand, links, pressable action, and the same in the phone menu" do
    get terms_path

    assert_select "nav.site-nav[data-controller='navbar']" do
      assert_select "a.site-nav__brand[data-nav='logo']"
      assert_select ".site-nav__links a.site-nav__link", minimum: 2
      assert_select ".site-nav__links a.btn3.btn3--sm", text: I18n.t("nav.sign_up")
      assert_select "#navbar-mobile-menu a.site-nav__link", minimum: 2
      assert_select "#navbar-mobile-menu a.btn3", text: I18n.t("nav.sign_up")
    end
  end

  test "the bar's ground and type come from the tokens" do
    css = Rails.root.join("app/assets/tailwind/application.css").read
    rule = css[/^\s*\.site-nav \{[^}]*\}/m].to_s
    assert_includes rule, "background: color-mix(in srgb, var(--color-bg) 90%, transparent)"
    assert_includes rule, "border-bottom: 1px solid var(--color-border-subtle)"
    assert_match(/\.site-nav__link \{[^}]*color: var\(--color-sub\)/m, css)
  end
end
