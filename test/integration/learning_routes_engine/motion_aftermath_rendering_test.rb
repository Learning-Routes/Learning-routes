require "test_helper"

# WP-36 task 9, Ruling A. Task 8 made the parser emit `aftermath` for a motion
# block — the markdown an author wrote after the block's JSON — but nothing
# rendered it yet, so a motion block still lost it, just one layer further
# along than the bug WP-33 §2 fixed for `check`. `_motion.html.erb` renders it
# through the shared `aftermath` partial, the same way `_simulation.html.erb`
# and the others do.
module LearningRoutesEngine
  class MotionAftermathRenderingTest < ActionDispatch::IntegrationTest
    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      @preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    def build_step(position, aftermath:)
      section = {
        "type" => "motion", "scene" => "greeting", "data" => { "step" => 0 },
        "narration" => "Mira la escena.", "aftermath" => aftermath,
        "body" => "whatever the raw body was"
      }
      @route.route_steps.create!(
        route_module: @preview, title: "Escena #{position}", position: position,
        status: :in_progress, content_type: :lesson, level: :nv1, bloom_level: 1,
        metadata: { "parsed_sections" => [section], "content_ready" => true }
      ).tap do |step|
        ContentEngine::AiContent.create!(route_step: step, content_type: :text, body: "## Motion: greeting\n{}")
      end
    end

    test "the motion section renders its aftermath when the author wrote one" do
      step = build_step(0, aftermath: "Trailing prose the author wrote after the scene.")

      get learning_routes_engine.route_step_path(@route, step)
      assert_response :success

      section = Nokogiri::HTML(response.body).at_css(".lesson-section[data-section-index='0']")
      assert section, "the motion section element is missing"
      assert_includes section.to_html, "Trailing prose the author wrote after the scene.",
        "the motion block's aftermath is not rendered at all"
    end

    test "the motion section omits the aftermath container when there is none" do
      step = build_step(1, aftermath: nil)

      get learning_routes_engine.route_step_path(@route, step)
      assert_response :success

      section = Nokogiri::HTML(response.body).at_css(".lesson-section[data-section-index='0']")
      assert section, "the motion section element is missing"
      assert_nil section.at_css(".lesson-content.mt-6"),
        "the aftermath container rendered even though the section carried no aftermath"
    end
  end
end
