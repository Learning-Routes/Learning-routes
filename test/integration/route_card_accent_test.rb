require "test_helper"

# STEP 41 §3.1: the route card is the reference's card. It names the level of the
# stage the student is in (STEP 38 §3: one rule, the journey's), its current
# module and the topics done there, a mini-route of that module in a tray, the
# groove and Continuar. It draws in Ciruela's tokens: the accent for the route
# and done stops, the highlight for the current one, the faint outline for the
# rest; no per-level colours, no literal hex.
class RouteCardAccentTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_test_user(email_verified_at: Time.current, locale: "es")
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
  end

  test "routes at the same stage level name the same level; a route further on names its own" do
    first = route_at(levels: %w[nv1 nv2], completed: 0, topic: "Ruta de Ciencias")
    second = route_at(levels: %w[nv1 nv2], completed: 0, topic: "Ruta de Música")
    further = route_at(levels: %w[nv1 nv2], completed: 1, topic: "Ruta de Diseño")

    get_profile

    assert_select card(first) + " .level-tag[data-route-level='nv1']", text: "Nivel 1"
    assert_select card(second) + " .level-tag[data-route-level='nv1']", text: "Nivel 1"
    assert_select card(further) + " .level-tag[data-route-level='nv2']", text: "Nivel 2"
  end

  test "a finished route keeps the level it finished at" do
    done = route_at(levels: %w[nv1 nv3], completed: 2, topic: "Ruta terminada")

    get_profile

    assert_select card(done) + " .level-tag[data-route-level='nv3']", text: "Nivel 3"
  end

  test "the card shows its current module, the topics done there, the mini-route, the groove and Continuar" do
    route = two_modules(done: 2)

    get_profile

    assert_select card(route) do
      assert_select ".route-card__module", text: "Módulo 1 de 2"
      assert_select "h3", text: "Portugués para viajar"
      assert_select ".route-card__sub", text: "Fundamentos · 2 de 6 temas"
      assert_select ".tray svg [data-stop='done']", 2
      assert_select ".tray svg [data-stop='current']", 1
      assert_select ".tray svg [data-stop='todo']", 3
      assert_select ".groove > span[style*='width:33%']"
      assert_select "a.btn3[href=?]", learning_routes_engine.journey_route_path(route), text: "Continuar"
    end
  end

  test "the card draws in Ciruela's tokens: no level colours, no literal hex" do
    route = two_modules(done: 2)

    get_profile

    html = css_select(card(route)).first.to_html
    assert_no_match(/#[0-9A-Fa-f]{6}\b/, html)
    assert_no_match(/--color-node-/, html)
    assert_includes html, "var(--color-accent)"
    assert_includes html, "var(--color-highlight)"
    assert_includes html, "var(--color-faint)"
  end

  # Owner, 22 Oct: a route that is not active says so in a small tag, with the
  # dashboard's labels; a finished route's button reads Ver ruta.
  { "completed" => "Completada", "paused" => "Pausada", "draft" => "Borrador" }.each do |status, label|
    test "a #{status} route carries a #{label} tag" do
      route = two_modules(done: 2)
      route.update!(status: status)

      get_profile

      assert_select card(route) + " .route-card__status.tag", text: label
      button = status == "completed" ? "Ver ruta" : "Continuar"
      assert_select card(route) + " a.btn3", text: button
    end
  end

  test "an active route carries no status tag" do
    route = two_modules(done: 2)

    get_profile

    assert_select card(route) + " .route-card__status", 0
  end

  test "Sigue donde lo dejaste: the latest active route's current topic, with its place and time" do
    route = two_modules(done: 2)

    get_profile

    step = route.route_steps.find_by!(position: 2)
    assert_select ".resume-card" do
      assert_select ".resume-card__eyebrow", text: "Sigue donde lo dejaste"
      assert_select "h3", text: "Ser y estar"
      assert_select ".resume-card__meta", text: "Portugués para viajar · Tema 3 de 6 · unos 8 minutos"
      assert_select "a.btn3[href=?]", learning_routes_engine.route_step_path(route, step), text: "Continuar"
    end
  end

  test "with nothing to continue there is no resume card" do
    get_profile

    assert_select ".resume-card", 0
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

  # Fundamentos (6 topics, `done` of them done) then a locked second module.
  def two_modules(done:)
    route = LearningRoutesEngine::LearningRoute.create!(learning_profile: @profile, topic: "Portugués para viajar",
                                                        locale: "es", status: :active, current_step: done)
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
    preview.update!(title: "Fundamentos", translations: {})
    second = route.route_modules.create!(position: 2, title: "En el camino", access_state: :locked, generation_state: :ready)
    ["Saludos", "Pronombres", "Ser y estar", "Números", "Direcciones", "Examen"].each_with_index do |title, i|
      route.route_steps.create!(route_module: preview, title: title, position: i, level: :nv1, bloom_level: 1,
                                content_type: :lesson, estimated_minutes: 8,
                                status: i < done ? :completed : (i == done ? :available : :locked))
    end
    2.times do |i|
      route.route_steps.create!(route_module: second, title: "Paso #{i}", position: 10 + i, level: :nv1, bloom_level: 1,
                                content_type: :lesson, status: :locked)
    end
    route
  end

  def get_profile
    post core.sign_in_path, params: { email: @user.email, password: "password123" }
    get profile_path
    assert_response :success
  end

  def card(route) = ".route-card[data-route-id='#{route.id}']"
end
