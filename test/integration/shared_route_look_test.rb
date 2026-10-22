require "test_helper"

# STEP 41 §3.3: the public shared route on the foundations: a page title, its
# summary bar, each step and the comments box as cards with body.
class SharedRouteLookTest < ActionDispatch::IntegrationTest
  test "the shared route is built from the foundations" do
    user = create_test_user(email_verified_at: Time.current, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "Portugués para viajar", locale: "es", status: :active)
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
    3.times { |i| route.route_steps.create!(route_module: preview, title: "Paso #{i}", position: i, level: :nv1, bloom_level: 1, content_type: :lesson, status: :available) }
    shared = CommunityEngine::SharedRoute.create!(learning_route: route, user: user, visibility: "public", share_token: SecureRandom.hex(8))

    get community_engine.shared_route_path(shared)

    assert_response :success
    assert_select "h1.page-title", text: "Portugués para viajar"
    assert_select ".shared-route__stats.card3", 1
    assert_select ".shared-route__step.card3", 3
    assert_select ".shared-route__comments .card3", minimum: 1
  end
end
