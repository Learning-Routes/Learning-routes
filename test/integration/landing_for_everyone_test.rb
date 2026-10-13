require "test_helper"

# Owner's ruling, 13 October: the landing is the landing for everyone. GET /
# never redirects, signed in or not, whatever the role and whether or not there
# is a route. Students reach their route through "My routes".
#
# It replaces landing_redirects_signed_in_students_test.rb (WP-35 §5), which sent
# a signed-in student from / to their route. The empty-satellite defect that
# redirect worked around stays pinned here: every node of the landing is the
# visitor page's own, every satellite labelled.
class LandingForEveryoneTest < ActionDispatch::IntegrationTest
  setup do
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
  end

  test "a visitor sees the landing" do
    get root_path

    assert_landing
  end

  test "a signed-in student with a route sees the landing" do
    sign_in_as(role: :student, with_route: true)

    get root_path

    assert_landing
  end

  test "a signed-in student without a route sees the landing" do
    sign_in_as(role: :student, with_route: false)

    get root_path

    assert_landing
  end

  test "a signed-in teacher sees the landing" do
    sign_in_as(role: :teacher, with_route: true)

    get root_path

    assert_landing
  end

  test "the signed-in owner sees the landing" do
    sign_in_as(role: :owner, with_route: true)

    get root_path

    assert_landing
  end

  private

  def sign_in_as(role:, with_route:)
    user = create_test_user(email_verified_at: Time.current, role: role, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    if with_route
      LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "Portugués", locale: "es",
                                                  status: :active)
    end
    post core.sign_in_path, params: { email: user.email, password: "password123" }
    follow_redirect! while response.redirect?
    user
  end

  def assert_landing
    assert_response :success
    assert_nil response.location, "GET / must never redirect"
    assert_select "section#how-it-works"

    nodes = @controller.instance_variable_get(:@route_nodes)
    assert_equal 6, nodes.size
    nodes.each do |node|
      Array(node[:sats]).each do |sat|
        assert sat[:topic].present?, "a satellite was rendered with no topic — the empty-circle defect"
      end
    end
  end
end
