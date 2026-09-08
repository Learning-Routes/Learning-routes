require "test_helper"

# THE CLASS: a view escapes what ERB is already escaping.
#
# WP-33 §3. `_code_playground.html.erb:4` was
#
#   data-code-playground-initial-code-value="<%= section[:code]&.gsub('"', '&quot;') %>"
#
# — the same double escape WP-24 §2 removed from `_scenario.html.erb`. ERB
# escapes an attribute value on its own, so the `&` of the hand-written `&quot;`
# became `&amp;quot;`, the browser decoded it once, and the attribute held the
# six literal characters. `code_playground_controller.js:192-193` writes that
# value back into the editor on Reset, so `print("hola")` became
# `print(&quot;hola&quot;)` and the next Run was a SyntaxError.
#
# The textarea at :33-36 is seeded from `<%= section[:code] %>` and was always
# fine, which is why this only ever broke after pressing Reset.
module LearningRoutesEngine
  class PlaygroundResetTest < ActionDispatch::IntegrationTest
    CODE = %(print("hola")\nprint('adiós')).freeze

    BODY = <<~MARKDOWN.freeze
      ## Playground: Saludos

      ```python
      print("hola")
      print('adiós')
      ```

      Expected output: hola
    MARKDOWN

    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
      sections = ContentEngine::LessonSectionParser.call(BODY).map(&:as_json)
      @step = @route.route_steps.create!(
        route_module: preview, title: "Lección", position: 0, status: :in_progress,
        content_type: :lesson, level: :nv1, bloom_level: 1,
        metadata: { "parsed_sections" => sections, "content_ready" => true }
      )
      ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: BODY)
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    test "the reset value decodes back to the source, quotes intact" do
      get learning_routes_engine.route_step_path(@route, @step)

      assert_response :success
      node = Nokogiri::HTML(response.body).at_css("[data-code-playground-initial-code-value]")
      assert node, "the playground did not render"

      # Nokogiri decodes the attribute exactly as a browser does.
      value = node["data-code-playground-initial-code-value"]
      assert_includes value, 'print("hola")',
        "Reset would restore escaped entities instead of code: the value decodes to " \
        "#{value.inspect}"
      assert_not_includes value, "&quot;",
        "the attribute still carries a hand-written entity; ERB escaped the ampersand " \
        "and the browser decodes it to a literal &quot;"
    end

    test "the raw attribute carries ERB's escape exactly once" do
      get learning_routes_engine.route_step_path(@route, @step)

      raw = response.body[/data-code-playground-initial-code-value="([^"]*)"/, 1]

      assert_includes raw, "&quot;", "ERB must escape the double quotes in the attribute"
      assert_not_includes raw, "&amp;quot;",
        "double escaped: the view added an entity that ERB then escaped again"
    end

    # The sweep. This is the second time this exact gsub has shipped.
    test "no view hand-escapes double quotes into an attribute" do
      offenders = Dir[
        Rails.root.join("app/views/**/*.erb"),
        Rails.root.join("engines/*/app/views/**/*.erb")
      ].select do |path|
        source = File.read(path)
        source.include?(%q{gsub('"', '&quot;')}) || source.include?(%q{gsub('"', "&quot;")}) ||
          source.include?(%q{gsub("\"", "&quot;")})
      end

      assert_equal [], offenders.map { |f| f.sub("#{Rails.root}/", "") },
        "ERB escapes attribute values on its own; a hand-written &quot; is escaped " \
        "a second time and reaches the browser as literal characters"
    end

    test "the playground's buttons speak the student's language" do
      get learning_routes_engine.route_step_path(@route, @step)

      assert_no_match(/aria-label="Reset code"/, response.body)
      assert_no_match(/aria-label="Run code"/, response.body)
      assert_no_match(/>Run ▶</, response.body)
      assert_match I18n.t("learning_engine.blocks.run", locale: :es), response.body
    end
  end
end
