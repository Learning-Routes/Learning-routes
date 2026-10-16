require "application_system_test_case"

# STEP 38 §3, owner's answer 6: the route line on a profile card has a soft
# shadow, drawn in the light theme's ink in both themes, so in dark it was a dark
# smear on a dark card. It is --color-tint-strong of the current theme.
class RouteCardDrawingTest < ApplicationSystemTestCase
  def setup
    @user = create_test_user(email_verified_at: Time.current, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "Ruta de Música", locale: "es", status: :active)
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
    3.times do |i|
      route.route_steps.create!(route_module: preview, title: "Paso #{i}", position: i, level: :nv1, bloom_level: 1,
                                content_type: :lesson, status: :available)
    end
    sign_in_through_ui
  end

  test "the card's route shadow is the theme's tint, in light and in dark" do
    strokes = %w[light dark].to_h do |theme|
      @user.update!(theme: theme)
      visit profile_path
      assert_selector "html[data-theme='#{theme}']", visible: :all, wait: 5
      assert_selector "[data-controller='compact-route'] svg path", wait: 5

      shadow, tint = page.evaluate_script(<<~JS)
        [document.querySelector("[data-controller='compact-route'] svg path").getAttribute("stroke"),
         getComputedStyle(document.documentElement).getPropertyValue("--color-tint-strong").trim()]
      JS
      assert_equal tint, shadow, "#{theme}: the shadow is not the theme's --color-tint-strong"
      [theme, shadow]
    end

    assert_not_equal strokes["light"], strokes["dark"], "the dark card drew the light theme's shadow"
  end

  private

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    assert_field "email", with: @user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
  end
end
