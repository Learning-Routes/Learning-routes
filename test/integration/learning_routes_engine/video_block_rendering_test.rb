require "test_helper"
require "support/video_lesson_helpers"

# WP-38 Task 2. `## Video:` is heading-authored by the studio, never by the model,
# and it is not a gating type (BlockGrader::GATING_TYPES pins existing behaviour —
# video was never added to it). What this file protects against is the one failure
# mode a video block can have that no other block type can: a broken upload must
# never reach the student as an empty <video> box with nothing to play.
module LearningRoutesEngine
  class VideoBlockRenderingTest < ActionDispatch::IntegrationTest
    include VideoLessonHelpers

    VIDEO_SECTION = {
      "type" => "video", "title" => "La ese de la tercera persona",
      "video_url" => "/rails/active_storage/blobs/proxy/abc/l.mp4",
      "subtitles_url" => "/rails/active_storage/blobs/proxy/def/l.srt",
      "duration_seconds" => 477, "source" => "manim-studio",
      "lesson_id" => "third-person-s", "voice" => "english-teacher",
      "published_at" => "2026-09-16T13:00:04Z"
    }.freeze

    CONCEPT_SECTION = { "type" => "concept", "title" => "Resumen", "body" => "Texto." }.freeze

    test "a video section renders a real player, not a blank box" do
      step = step_with_sections([VIDEO_SECTION, CONCEPT_SECTION])
      sign_in_as(@video_user)

      get learning_routes_engine.route_step_path(step.learning_route, step)

      assert_response :success
      doc = Nokogiri::HTML(response.body)

      player = doc.at_css(".lesson-video__player")
      assert player, "no <video> element rendered for a valid video section"
      assert_equal "video", player.name
      assert_equal VIDEO_SECTION["video_url"], player.at_css("source")["src"],
        "the player is not pointed at the section's video_url"
      assert_nil player["data-controller"],
        "no Stimulus controller reads anything off the video element; none should be wired"
    end

    test "video is not a gating type: a video + concept step has nothing outstanding" do
      step = step_with_sections([VIDEO_SECTION, CONCEPT_SECTION])

      assert_equal [], step.outstanding_blocks_for(@video_user),
        "a video section must never gate step completion (BlockGrader::GATING_TYPES)"
      assert_equal 0, LearningRoutesEngine::BlockAttempt.where(route_step: step).count,
        "nothing about a video section should require a recorded attempt"
    end

    test "an unparsable video renders as a concept in the actual view, never a blank player" do
      sections = ContentEngine::LessonSectionParser.call("## Video: Roto\n\n{not json").map(&:as_json)
      assert_nil sections.find { |s| s["type"] == "video" },
        "test premise: the fixture body must fail to parse as a video"

      step = step_with_sections(sections)
      sign_in_as(@video_user)

      get learning_routes_engine.route_step_path(step.learning_route, step)

      assert_response :success
      assert_not_includes response.body, "<video",
        "a broken upload must not reach the student as an empty <video> box"
      assert_includes response.body, "Roto",
        "the title survives as a concept so the student sees something"
    end

    # The tail the author left after the studio's upload is real lesson material.
    # Every other partial that can carry one renders it below the card; this one
    # measures it where it matters — on the page the student loads.
    test "prose the author left after the video is shown below the player" do
      section = VIDEO_SECTION.merge(
        "aftermath" => "### Lo que pasa realmente\n\nPrimera línea de la cola."
      )
      step = step_with_sections([section])
      sign_in_as(@video_user)

      get learning_routes_engine.route_step_path(step.learning_route, step)

      assert_response :success
      assert_includes response.body, "Primera línea de la cola",
        "the aftermath was parsed and persisted, and the student never sees it"
      assert_includes response.body, "Lo que pasa realmente",
        "the sub-heading the author wrote after the video is lesson content too"
    end

    private

    def sign_in_as(user)
      post core.sign_in_path, params: { email: user.email, password: "password123" }
    end
  end
end
