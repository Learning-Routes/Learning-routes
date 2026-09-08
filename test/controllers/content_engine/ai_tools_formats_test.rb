require "test_helper"

# WP-35 §2, from the production log of 7 September: the failure behind the
# escaped `<p …>` on screen was `ActionController::UnknownFormat`, raised AFTER
# the paid call had already succeeded.
#
# The four legacy buttons fetch with `Accept: text/vnd.turbo-stream.html`;
# `agent_interact`'s success `respond_to` declared only json and html; the
# `rescue => e` below caught the UnknownFormat as if the model had failed and
# answered from its own turbo_stream branch — which built markup in a String, so
# Rails escaped it — at HTTP 200. Three defects stacked: the wrong format, a
# rescue that mislabels a routing error as a model failure, and a failure served
# as success.
module ContentEngine
  class AiToolsFormatsTest < ActionDispatch::IntegrationTest
    LEGACY_ACTIONS = %w[explain_differently give_example simplify deepen].freeze

    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      preview = LearningRoutesEngine::RouteModule.find_by!(
        learning_route_id: @route.id, access_state: :preview
      )
      @step = @route.route_steps.create!(
        route_module: preview, title: "Saludos", position: 0, status: :in_progress,
        content_type: :lesson, level: :nv1, bloom_level: 1
      )
      ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: "## Concepto\nHola")
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    LEGACY_ACTIONS.each do |action|
      test "#{action} answers a turbo-stream request with a turbo stream" do
        with_agent_reply("Aquí tienes otra explicación.") do
          post content_engine.public_send("#{action}_lesson_path", @step),
               headers: { "Accept" => "text/vnd.turbo-stream.html" }
        end

        assert_response :success
        assert_match(/<turbo-stream action="append"/, response.body,
          "the paid call succeeded and respond_to then raised UnknownFormat, which " \
          "the rescue below reported as a model failure")
        assert_no_match(/&lt;p/, response.body,
          "markup built in a String is escaped by turbo_stream.update and printed as text")
      end
    end

    test "a failed tool says so with a non-2xx, in every format" do
      { "text/vnd.turbo-stream.html" => :bad_gateway,
        "application/json" => :bad_gateway }.each do |accept, expected|
        with_agent_failure(RuntimeError.new("upstream exploded")) do
          post content_engine.give_example_lesson_path(@step), headers: { "Accept" => accept }
        end

        assert_response expected,
          "a failure answered 200 for #{accept}: the client reads it as success"
      end
    end

    test "a failed tool renders a readable sentence, not escaped markup" do
      with_agent_failure(RuntimeError.new("upstream exploded")) do
        post content_engine.give_example_lesson_path(@step),
             headers: { "Accept" => "text/vnd.turbo-stream.html" }
      end

      assert_no_match(/&lt;p/, response.body)
      assert_match I18n.t("content_actions.agent_failed", locale: :es), response.body
    end

    test "a rate-limited tool answers 429 in every format" do
      %w[text/vnd.turbo-stream.html application/json].each do |accept|
        with_agent_failure(LessonAssistantAgent::RateLimitExceeded.new("slow down")) do
          post content_engine.give_example_lesson_path(@step), headers: { "Accept" => accept }
        end

        assert_response :too_many_requests, "rate limiting must not read as success for #{accept}"
      end
    end

    # `interact` is the JSON endpoint and has no template of its own; asking it
    # for a turbo stream must not 500 or 406 silently.
    test "interact still answers json" do
      with_agent_reply("respuesta") do
        post content_engine.interact_lesson_path(@step),
             params: { action_type: "give_example" },
             headers: { "Accept" => "application/json" }
      end

      assert_response :success
      assert JSON.parse(response.body)["success"]
    end

    private

    def with_agent_reply(content, &block)
      swap_agent(->(**) { { content: content, type: "example" } }, &block)
    end

    def with_agent_failure(error, &block)
      swap_agent(->(**) { raise error }, &block)
    end

    # `minitest/mock` is unavailable in this suite; swap the instance method and
    # restore it, the house idiom.
    def swap_agent(replacement)
      original = LessonAssistantAgent.instance_method(:interact)
      LessonAssistantAgent.define_method(:interact, replacement)
      yield
    ensure
      LessonAssistantAgent.define_method(:interact, original)
    end
  end
end
