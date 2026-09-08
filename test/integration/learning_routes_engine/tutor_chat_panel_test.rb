require "test_helper"

# WP-35 §1, the half a student sees.
module LearningRoutesEngine
  class TutorChatPanelTest < ActionDispatch::IntegrationTest
    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
      @step = @route.route_steps.create!(
        route_module: preview, title: "Saludos", position: 0, status: :in_progress,
        content_type: :lesson, level: :nv1, bloom_level: 1,
        metadata: { "parsed_sections" => [{ "type" => "concept", "title" => "C", "body" => "b" }],
                    "content_ready" => true }
      )
      ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: "## Concepto: x\nb")
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    test "the lesson page subscribes to the tutor stream the job broadcasts to" do
      get learning_routes_engine.route_step_path(@route, @step)

      assert_response :success
      assert_select "turbo-cable-stream-source[signed-stream-name]", minimum: 1
      assert_match Turbo::StreamsChannel.signed_stream_name("tutor_chat_step_#{@step.id}"),
        response.body,
        "the panel must carry a cable subscription for this step's tutor stream"
    end

    # `index` could always render the transcript and nothing called it, so a
    # reload lost the conversation while every message sat in the database.
    test "the transcript is rendered on load, not just the greeting" do
      TutorMessage.create!(user: @user, step: @step, role: "user", content: "¿Cómo se dice hola?")
      TutorMessage.create!(user: @user, step: @step, role: "assistant", content: "Se dice olá.")

      get learning_routes_engine.route_step_path(@route, @step)

      assert_match "¿Cómo se dice hola?", response.body
      assert_match "Se dice olá.", response.body
    end

    test "another student's messages are not in the transcript" do
      other = create_test_user(email_verified_at: Time.current)
      TutorMessage.create!(user: other, step: @step, role: "user", content: "secreto ajeno")

      get learning_routes_engine.route_step_path(@route, @step)

      assert_no_match "secreto ajeno", response.body
    end

    # `message.content.html_safe` rendered the student's own text raw.
    test "a student's own message is escaped, not rendered as markup" do
      TutorMessage.create!(
        user: @user, step: @step, role: "user",
        content: "<img src=x onerror=alert(1)>"
      )

      get learning_routes_engine.route_step_path(@route, @step)

      assert_no_match(/<img src=x onerror/, response.body,
        "the student's own text was rendered as HTML: stored XSS on a field they control")
      assert_match "&lt;img src=x onerror=alert(1)&gt;", response.body
    end

    test "an assistant reply keeps its markdown but loses its script tags" do
      TutorMessage.create!(
        user: @user, step: @step, role: "assistant",
        content: "Se dice **olá**.<script>alert(1)</script>"
      )

      get learning_routes_engine.route_step_path(@route, @step)

      assert_match "<strong>olá</strong>", response.body
      assert_no_match(/<script>alert\(1\)<\/script>/, response.body)
    end
  end
end
