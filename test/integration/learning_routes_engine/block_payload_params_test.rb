require "test_helper"

# THE CLASS: a block submission stores only the keys a block sends.
#
# `BlockAttemptsController#block_payload` used `permit!`, so whatever a client
# posted under `block` was stored on the attempt's `payload` (Brakeman's
# MassAssignment warning, the reason CI's scan_ruby could never pass). The
# grader reads three keys, and the block controllers send nine shapes between
# them (block_submission.js callers: check, scenario, fill_blank, drag_drop,
# flashcards, simulation). Every one of those must still arrive intact, and
# nothing else may.
module LearningRoutesEngine
  class BlockPayloadParamsTest < ActionDispatch::IntegrationTest
    CHECK_SECTION = {
      "type" => "check",
      "question" => "¿Cuál es la correcta?",
      "options" => [
        { "label" => "La correcta", "correct" => true },
        { "label" => "La incorrecta", "correct" => false }
      ]
    }.freeze

    # One payload per shape the JavaScript sends, as JSON delivers it.
    SHAPES = {
      "check" => { "option_index" => 1 },
      "check timed out" => { "option_index" => nil, "timed_out" => true },
      "fill_blank" => { "answers" => %w[hola adiós] },
      "drag_drop" => { "matches" => { "0" => "1", "1" => "0" } },
      "flashcards" => { "ratings" => { "0" => "good", "1" => "hard" }, "rated_count" => 2 },
      "simulation" => { "interacted" => true }
    }.freeze

    setup do
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(learning_profile: profile, topic: "Portugués", locale: "es", status: :active)
      @preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
      @position = -1
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    test "keys no block sends are not stored" do
      payload = submit({ "option_index" => 0, "correct" => true, "score" => 100, "user_id" => "someone",
                         "nested" => { "role" => "owner" } })

      assert_equal({ "option_index" => 0, "submission_complete" => true }, payload)
    end

    test "a block that is not an object is a bad request, not a server error" do
      step = new_step
      post learning_routes_engine.route_step_block_attempt_path(@route, step, section_index: 0),
           params: { block: "x" }, as: :json

      assert_response :bad_request
      assert_not BlockAttempt.exists?(route_step: step)
    end

    SHAPES.each do |name, block|
      test "the #{name} shape arrives intact" do
        assert_equal block.merge("submission_complete" => true), submit(block)
      end
    end

    private

    def submit(block)
      step = new_step
      post learning_routes_engine.route_step_block_attempt_path(@route, step, section_index: 0),
           params: { block: block.merge("submission_complete" => true) }, as: :json
      assert_response :success
      BlockAttempt.find_by!(user: @user, route_step: step, section_index: 0).payload
    end

    def new_step
      @route.route_steps.create!(
        route_module: @preview, title: "Paso", position: @position += 1, status: :in_progress,
        content_type: :lesson, level: :nv1, bloom_level: 1, metadata: { "parsed_sections" => [CHECK_SECTION.deep_dup] }
      )
    end
  end
end
