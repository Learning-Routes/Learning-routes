require "test_helper"

# STEP 38 §1: a fresh route with no lessons showed "35.2 % precisión" — every
# card got the user's average over ALL assessments. A card's precision is that
# route's own scored attempts, and "—" until there is one.
class ProfileRouteCardAccuracyTest < ActionDispatch::IntegrationTest
  test "each route card shows its own precision, and a route without an assessment shows a dash" do
    user = create_test_user(email_verified_at: Time.current, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    assessed = create_route(profile, "Ruta de Ciencias")
    fresh = create_route(profile, "Ruta de Música")

    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: assessed.id, access_state: :preview)
    step = assessed.route_steps.create!(
      route_module: preview, title: "Examen", position: 0, status: :completed,
      content_type: :assessment, level: :nv1, bloom_level: 1
    )
    assessment = Assessments::Assessment.create!(route_step: step, assessment_type: :level_up, passing_score: 70)
    Assessments::AssessmentResult.create!(user: user, assessment: assessment, score: 35.2)
    Assessments::AssessmentResult.create!(user: user, assessment: assessment, score: nil) # open attempt

    post core.sign_in_path, params: { email: user.email, password: "password123" }
    get profile_path

    assert_response :success
    assert_select "a[href=?] [data-stat='accuracy']", journey_path(assessed), text: "35.2%"
    assert_select "a[href=?] [data-stat='accuracy']", journey_path(fresh), text: "—"
  end

  test "the header's overall precision is a dash until the user has a scored assessment" do
    user = create_test_user(email_verified_at: Time.current, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    route = create_route(profile, "Ruta de Ciencias")
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
    step = route.route_steps.create!(
      route_module: preview, title: "Examen", position: 0, status: :available,
      content_type: :assessment, level: :nv1, bloom_level: 1
    )
    assessment = Assessments::Assessment.create!(route_step: step, assessment_type: :level_up, passing_score: 70)
    post core.sign_in_path, params: { email: user.email, password: "password123" }

    get profile_path
    assert_select "[data-stat='overall-accuracy']", text: "—"

    Assessments::AssessmentResult.create!(user: user, assessment: assessment, score: nil) # open attempt
    get profile_path
    assert_select "[data-stat='overall-accuracy']", text: "—"

    Assessments::AssessmentResult.create!(user: user, assessment: assessment, score: 35.2)
    get profile_path
    assert_select "[data-stat='overall-accuracy']", text: "35.2%"
  end

  private

  def create_route(profile, topic)
    LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: topic, locale: "es", status: :active)
  end

  def journey_path(route)
    learning_routes_engine.journey_route_path(route)
  end
end
