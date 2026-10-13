require "test_helper"

# PROMPT 33. The navbar logo linked to root_path, which redirects a signed-in
# student back to their route: a click that did nothing. For a signed-in user
# the logo now goes where the landing would send them (SignedInHomeHelper, one
# rule for the controller and the view). A "Home" link opens the landing through
# `?from=nav`, which never redirects.
class NavbarHomeLinksTest < ActionDispatch::IntegrationTest
  test "a student with a route: the logo goes to the route, Home to the landing" do
    user = sign_in_student
    route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: user.learning_profile, topic: "Portugués", locale: "es", status: :active
    )

    get profile_path

    assert_select "nav a[data-nav='logo'][href=?]", learning_routes_engine.route_path(route)
    assert_select "nav a[data-nav='home'][href=?]", root_path(from: "nav"), minimum: 1
  end

  test "a student without a route: the logo goes to the dashboard" do
    sign_in_student

    get profile_path

    assert_select "nav a[data-nav='logo'][href=?]", dashboard_path
  end

  test "a visitor: the logo goes to the landing, and there is no Home link" do
    get root_path

    assert_select "nav a[data-nav='logo'][href=?]", root_path
    assert_select "nav a[data-nav='home']", count: 0
  end

  test "Home reads Inicio in Spanish and Home in English" do
    user = sign_in_student

    get profile_path
    assert_select "nav a[data-nav='home']", text: "Inicio"

    user.update!(locale: "en")
    get profile_path
    assert_select "nav a[data-nav='home']", text: "Home"
  end

  private

  def sign_in_student
    user = create_test_user(email_verified_at: Time.current, locale: "es")
    LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    post core.sign_in_path, params: { email: user.email, password: "password123" }
    user
  end
end
