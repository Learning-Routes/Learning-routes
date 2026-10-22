require "application_system_test_case"

# Found while rendering STEP 41 §3: the profile's tabs wrote the active colour
# as the theme's resolved hex when the page loaded. Switching the theme left the
# active tab in the old theme's colour: near-white on the light page.
class ProfileTabsThemeTest < ApplicationSystemTestCase
  test "after a theme switch the active tab still reads on the page" do
    user = Core::User.create!(name: "Ana", email: "tabs-#{SecureRandom.hex(4)}@example.com", password: "password123",
                              password_confirmation: "password123", email_verified_at: Time.current, locale: "es")
    LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    visit core.sign_in_path
    fill_in "email", with: user.email
    fill_in "password", with: "password123"
    find("form[action='#{core.sign_in_path}'] [type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5

    %w[dark light].each do |first|
      second = first == "dark" ? "light" : "dark"
      page.execute_script("document.documentElement.setAttribute('data-theme', #{first.to_json})")
      visit profile_path
      assert_selector "#tab-0[aria-selected='true']"
      page.execute_script("document.documentElement.setAttribute('data-theme', #{second.to_json})")
      sleep 0.4

      ratio = page.evaluate_script(<<~JS)
        (() => {
          const rgb = (c) => c.match(/[0-9.]+/g).map(Number);
          const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
            .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
          const a = lum(rgb(getComputedStyle(document.getElementById("tab-0")).color));
          const b = lum(rgb(getComputedStyle(document.body).backgroundColor));
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        })()
      JS
      assert_operator ratio, :>=, 4.5, "loaded in #{first}, switched to #{second}: the active tab reads at #{ratio.round(2)}:1"
    end
  end
end
