require "test_helper"

# Owner's ruling, 13 October: `/` is the landing for everyone and never
# redirects, so the logo and "Home" both link to plain root_path for every user.
# A student reaches their route through "My routes".
class NavbarHomeLinksTest < ActionDispatch::IntegrationTest
  test "a student with a route: the logo and Home go to the landing, My routes to the routes" do
    user = sign_in_student
    LearningRoutesEngine::LearningRoute.create!(
      learning_profile: user.learning_profile, topic: "Portugués", locale: "es", status: :active
    )

    get profile_path

    assert_select "nav a[data-nav='logo'][href=?]", root_path
    assert_select "nav a[data-nav='home']", minimum: 1
    assert_select "nav a[data-nav='home']:not([href='#{root_path}'])", count: 0
    assert_select "nav a[href=?]", profile_path, minimum: 1
  end

  test "a student without a route: the logo goes to the landing" do
    sign_in_student

    get profile_path

    assert_select "nav a[data-nav='logo'][href=?]", root_path
  end

  # STEP 41 §2: the landing's bar is the reference's (logo, How it works, sign in
  # or My routes, Create my route). On the landing itself there is no Home link;
  # the logo is the way to plain /, and so is any Home link anywhere.
  test "a signed-in user on the landing: the logo goes to plain / and My routes to the routes" do
    sign_in_student

    get root_path

    assert_select ".lp-nav a[data-nav='logo'][href=?]", root_path
    assert_select "a[data-nav='home']:not([href='#{root_path}'])", count: 0
    assert_select ".lp-nav a[href=?]", profile_path
  end

  test "a visitor: the logo goes to the landing, and there is no Home link" do
    get root_path

    assert_select ".lp-nav a[data-nav='logo'][href=?]", root_path
    assert_select "a[data-nav='home']", count: 0
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
