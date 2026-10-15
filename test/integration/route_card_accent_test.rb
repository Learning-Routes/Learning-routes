require "test_helper"

# STEP 38 §3: the owner's profile showed two identical route cards in two
# different accents (teal, then gold): the accent was picked from the route's
# UUID. A card's accent is now the level of the stage the student is in, the
# same NV1/NV2/NV3 colour and tag the journey map uses, and the card shows it.
class RouteCardAccentTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_test_user(email_verified_at: Time.current, locale: "es")
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
  end

  test "routes at the same stage level share one accent, named on the card" do
    first = route_at(levels: %w[nv1 nv2], completed: 0, topic: "Ruta de Ciencias")
    second = route_at(levels: %w[nv1 nv2], completed: 0, topic: "Ruta de Música")
    further = route_at(levels: %w[nv1 nv2], completed: 1, topic: "Ruta de Diseño")

    get_profile

    assert_equal "--color-node-nv1", accent_of(first)
    assert_equal "--color-node-nv1", accent_of(second)
    assert_equal "--color-node-nv2", accent_of(further)
    assert_select card(first) + " [data-route-level]", text: "NV1"
    assert_select card(further) + " [data-route-level]", text: "NV2"
  end

  test "a finished route keeps the level it finished at" do
    done = route_at(levels: %w[nv1 nv3], completed: 2, topic: "Ruta terminada")

    get_profile

    assert_equal "--color-node-nv3", accent_of(done)
  end

  test "the card carries no literal hex colour" do
    route = route_at(levels: %w[nv1], completed: 0, topic: "Ruta de Ciencias")

    get_profile

    assert_no_match(/#[0-9A-Fa-f]{6}\b/, css_select(card(route)).first.to_html)
  end

  private

  def route_at(levels:, completed:, topic:)
    route = LearningRoutesEngine::LearningRoute.create!(learning_profile: @profile, topic: topic, locale: "es", status: :active)
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
    levels.each_with_index do |level, i|
      route.route_steps.create!(
        route_module: preview, title: "Paso #{i}", position: i, level: level, bloom_level: 1,
        content_type: :lesson, status: i < completed ? :completed : :available
      )
    end
    route
  end

  def get_profile
    post core.sign_in_path, params: { email: @user.email, password: "password123" }
    get profile_path
    assert_response :success
  end

  def card(route) = "a[href='#{learning_routes_engine.journey_route_path(route)}']"

  def accent_of(route)
    css_select("#{card(route)} [data-compact-route-color-value]").first["data-compact-route-color-value"]
  end
end
