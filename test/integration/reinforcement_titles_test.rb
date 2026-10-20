require "test_helper"

# A reinforcement's title is one of three locale strings (AdaptiveDifficulty).
# Rows written before WP-9 carry the English one on a Spanish route; the map
# translated its label, the Continue card showed 'Reinforcement: Review Key
# Concepts'. Every view says it in the ROUTE's language, whatever the UI's.
class ReinforcementTitlesTest < ActionDispatch::IntegrationTest
  { "es" => "en", "en" => "es" }.each do |route_locale, other|
    test "a #{route_locale} route's reinforcement reads in #{route_locale} on every view" do
      user = create_test_user(email_verified_at: Time.current, locale: other)
      profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
      route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: profile, topic: "Map", locale: route_locale, status: :active, current_step: 1
      )
      preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
      primary = route.route_steps.create!(route_module: preview, position: 0, title: "Primary lesson", status: :completed,
                                          content_type: :lesson, level: :nv1, bloom_level: 1)
      stored = I18n.t("learning_engine.reinforcement.review.title", locale: other)
      step = route.route_steps.create!(route_module: preview, position: 1, title: stored, status: :available,
                                       content_type: :lesson, level: :nv1, bloom_level: 1,
                                       metadata: { "reinforcement" => true, "triggering_step_id" => primary.id })
      title = I18n.t("learning_engine.reinforcement.review.title", locale: route_locale)
      short = I18n.t("learning_engine.reinforcement.review.short", locale: route_locale)
      sign_in_as(user)

      get learning_routes_engine.journey_route_path(route)
      assert_select ".jm-card__title", text: title
      topic = JSON.parse(css_select("[data-controller='route-journey']").first["data-route-journey-stages-value"])
        .flat_map { |stage| stage["topics"] }.find { |t| t["id"] == step.id }
      assert_equal [title, short], topic.values_at("name", "short_name"), "the popover's title and the map's label"
      assert_not_includes response.body, stored

      get learning_routes_engine.route_path(route)
      assert_includes response.body, title, "list view"
      assert_not_includes response.body, stored

      ContentEngine::AiContent.create!(route_step: step, content_type: :text, body: "## Repaso\n\nTexto.")
      get learning_routes_engine.route_step_path(route, step)
      assert_select "title", text: /\A#{Regexp.escape(title)} /
      assert_select "h1", text: title, message: "lesson header"
      assert_not_includes response.body, stored
    end
  end
end
