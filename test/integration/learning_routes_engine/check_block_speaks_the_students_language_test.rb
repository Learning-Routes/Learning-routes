require "test_helper"

# WP-35 §6. `_check.html.erb` and `lesson_quiz_controller.js` carried hardcoded
# Spanish — "DESAFÍO RÁPIDO", "+5 XP BONUS si respondes en <10s",
# "Explicación:" — shown to every English student. Two of the three are in the
# owner's screenshots.
#
# Scope is deliberately narrow: only what the screenshots showed plus what
# §1-§5 touched. The parser's persisted default titles ("Match", "Concepto", …)
# stay for WP-33, because fixing those means re-parsing.
module LearningRoutesEngine
  class CheckBlockSpeaksTheStudentsLanguageTest < ActionDispatch::IntegrationTest
    CHECK = {
      "type" => "check", "question" => "Which one?",
      "options" => [{ "label" => "This", "correct" => true },
                    { "label" => "That", "correct" => false }],
      "explanation" => "Because."
    }.freeze

    def build_for(locale)
      user = create_test_user(email_verified_at: Time.current, locale: locale)
      profile = LearningProfile.create!(user: user, current_level: "beginner")
      route = LearningRoute.create!(
        learning_profile: profile, topic: "Portuguese", locale: locale, status: :active
      )
      preview = RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
      step = route.route_steps.create!(
        route_module: preview, title: "Greetings", position: 0, status: :in_progress,
        content_type: :lesson, level: :nv1, bloom_level: 1,
        metadata: { "parsed_sections" => [CHECK.deep_dup], "content_ready" => true }
      )
      ContentEngine::AiContent.create!(route_step: step, content_type: :text, body: "## Concept\nx")
      post core.sign_in_path, params: { email: user.email, password: "password123" }
      [route, step]
    end

    test "an English student never reads the Spanish strings" do
      route, step = build_for("en")

      get learning_routes_engine.route_step_path(route, step)

      assert_response :success
      %w[DESAFÍO respondes Explicación].each do |spanish|
        assert_no_match(/#{spanish}/, response.body,
          "hardcoded Spanish was shown to an English student: #{spanish}")
      end
      assert_match I18n.t("learning_engine.check.challenge_badge", locale: :en), response.body
      assert_match I18n.t("learning_engine.check.explanation_label", locale: :en), response.body
    end

    test "a Spanish student still reads Spanish" do
      route, step = build_for("es")

      get learning_routes_engine.route_step_path(route, step)

      assert_response :success
      assert_match I18n.t("learning_engine.check.challenge_badge", locale: :es), response.body
      assert_match I18n.t("learning_engine.check.explanation_label", locale: :es), response.body
    end

    # The two strings the JS writes at runtime arrive through a data attribute,
    # the way `_lesson.html.erb` already passes `lesson_i18n`.
    test "the quiz controller is handed its strings rather than hardcoding them" do
      route, step = build_for("en")

      get learning_routes_engine.route_step_path(route, step)

      assert_match "data-lesson-quiz-i18n-value", response.body
      payload = response.body[/data-lesson-quiz-i18n-value="([^"]*)"/, 1]
      decoded = JSON.parse(CGI.unescapeHTML(payload))
      assert decoded["speed_bonus"].present?
      assert decoded["speed_bonus_earned"].present?
      assert_no_match(/respondes/, decoded.to_s, "the English payload carried Spanish")
    end

    # A sweep: no Spanish literal may sit in the JS the whole app loads.
    test "no hardcoded Spanish remains in the controllers this package touched" do
      offenders = %w[
        app/javascript/controllers/lesson_quiz_controller.js
        app/javascript/controllers/tutor_chat_controller.js
        app/javascript/controllers/ai_interaction_controller.js
      ].select do |path|
        File.read(Rails.root.join(path)).match?(/"[^"]*(respondes|Explicación|ganado|DESAFÍO)[^"]*"/)
      end

      assert_equal [], offenders,
        "these still hardcode Spanish the student reads; pass it through a data attribute"
    end
  end
end
