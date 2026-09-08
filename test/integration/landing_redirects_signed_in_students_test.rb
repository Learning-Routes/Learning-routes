require "test_helper"

# WP-35 §5. The landing rendered a "personalized" version of the visitor page
# for a signed-in student: `build_route_nodes` gave each node
# `sats: satellite_pattern(i)` — geometry only — while the marketing version
# gave each satellite a `topic` and a `desc`. So `path_viz_controller.js:250`
# read `undefined` and drew circles with nothing in them: the owner's screenshot
# is "Vocabulario de … / LEC / 01 / Completado" with three empty rings attached.
# The six nodes were the first six steps by position, which today is two lessons
# and four reinforcement steps.
#
# The settled decision: do not invent data for a decorative layout. The landing
# stays a visitor page, and a student who has somewhere to be is sent there.
class LandingRedirectsSignedInStudentsTest < ActionDispatch::IntegrationTest
  test "a visitor still sees the landing page" do
    get root_path

    assert_response :success
    assert_select "body"
  end

  test "a signed-in student with a route is sent to it" do
    user = create_test_user(email_verified_at: Time.current, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
    post core.sign_in_path, params: { email: user.email, password: "password123" }

    get root_path

    assert_redirected_to learning_routes_engine.route_path(route)
  end

  test "a signed-in student with no route is sent to the dashboard" do
    user = create_test_user(email_verified_at: Time.current)
    LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    post core.sign_in_path, params: { email: user.email, password: "password123" }

    get root_path

    assert_redirected_to dashboard_path
  end

  test "a signed-in user with no profile at all is sent to the dashboard" do
    user = create_test_user(email_verified_at: Time.current)
    post core.sign_in_path, params: { email: user.email, password: "password123" }

    get root_path

    assert_redirected_to dashboard_path
  end

  # The defect itself, stated so it cannot come back: no satellite may be
  # rendered without a label. The visitor page's satellites all carry one.
  test "every satellite on the landing has a real label" do
    get root_path

    nodes = @controller.instance_variable_get(:@route_nodes)
    assert nodes.present?, "the visitor landing must still have its nodes"

    nodes.each do |node|
      Array(node[:sats]).each do |sat|
        assert sat[:topic].present?,
          "a satellite was rendered with no topic — this is the empty-circle defect"
      end
    end
  end
end
