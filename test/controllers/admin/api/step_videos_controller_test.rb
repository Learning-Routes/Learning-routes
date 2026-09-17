require "test_helper"
require "support/video_lesson_helpers"

# THE CLASS: a door that answers 500 to a real subtitle file, and a refusal that
# rewrites the step it refused to touch.
#
# Everything positional in a lesson is indexed by `parsed_sections` position —
# `block_attempts.section_index`, the paid-for `image_url` on each section, and the
# `audio_sections` map keyed by the index AS A STRING. `LessonVideoPublisher` owns
# the offsets; this controller owns the two things around them that the service
# cannot see:
#
#   - the BYTES, validated before a single blob exists, because the proxy URLs the
#     payload carries can only be built from blobs and an attachment made for a
#     publish that then fails is a half-published step;
#   - the PURGE, which must happen on `:ok` and must NOT happen on `:conflict`.
#     A refusal that deletes the film it refused to unpublish is worse than the
#     re-pointing it was protecting against.
#
# Every request is wrapped in `with_token(TOKEN)`: the test environment carries no
# `studio.api_token`, and `Admin::Api::BaseController` treats a missing credential
# as the API being OFF, so an unwrapped request is a 401 and proves nothing.
class Admin::Api::StepVideosControllerTest < ActionDispatch::IntegrationTest
  include VideoLessonHelpers

  def setup
    @step = create_route_step_for_video
  end

  # ─── Task 6: POST ────────────────────────────────────────────────────

  test "a PNG renamed .mp4 is refused and nothing is attached" do
    with_token(TOKEN) do
      post video_path(@step), headers: auth(TOKEN), params: base_params.merge(
        video: fixture_upload(png_bytes, "lesson.mp4", "video/mp4")
      )
    end

    assert_response :unprocessable_entity
    assert_not @step.reload.lesson_video.attached?,
      "the filename said mp4 and the bytes said PNG; the bytes decide"
  end

  test "a body over 300 MB is refused with 413" do
    with_token(TOKEN) do
      post video_path(@step), headers: auth(TOKEN).merge("CONTENT_LENGTH" => 301.megabytes.to_s),
           params: base_params.merge(video: fixture_upload(mp4_bytes, "l.mp4", "video/mp4"))
    end

    # `:content_too_large`, not the brief's `:payload_too_large`: same 413, but Rack
    # 3.2 deprecates that spelling and it prints a warning on every run.
    assert_response :content_too_large
    assert_not @step.reload.lesson_video.attached?
  end

  test "subtitles that are neither SRT nor VTT are refused" do
    with_token(TOKEN) do
      post video_path(@step), headers: auth(TOKEN), params: base_params.merge(
        video: fixture_upload(mp4_bytes, "l.mp4", "video/mp4"),
        subtitles: fixture_upload("<html>nope</html>", "l.srt", "application/x-subrip")
      )
    end

    assert_response :unprocessable_entity
    assert_not @step.reload.lesson_video.attached?, "a bad subtitle must not leave a half-published step"
  end

  # NOT in the brief, and the reason it is here is that the brief's own `subtitles?`
  # cannot pass it: `sub(/\A\xEF\xBB\xBF/n, "")` is an ASCII-8BIT regexp, and
  # matching one against a UTF-8 string that is not pure ASCII raises
  # Encoding::CompatibilityError — i.e. on a BOM, and on every accented Spanish
  # subtitle file, which is all of them. A 500 on the app's normal input.
  test "a subtitle file with a UTF-8 BOM, CRLF and accents is accepted" do
    with_token(TOKEN) do
      post video_path(@step), headers: auth(TOKEN), params: base_params.merge(
        video: fixture_upload(mp4_bytes, "l.mp4", "video/mp4"),
        subtitles: fixture_upload("\uFEFF1\r\n00:00:00,000 --> 00:00:02,000\r\nMañana, señor.\r\n",
                                  "l.srt", "application/x-subrip")
      )
    end

    assert_response :created
    assert @step.reload.lesson_subtitles.attached?, "a BOM and a CRLF do not make an .srt invalid"
  end

  # A client mistake must be an answer, not a stack trace: `params[:video]` is nil
  # here, and `mp4?(nil)` is a NoMethodError and a 500.
  test "a request carrying no video file is refused" do
    with_token(TOKEN) { post video_path(@step), headers: auth(TOKEN), params: base_params }

    assert_response :unprocessable_entity
    assert_not @step.reload.lesson_video.attached?
  end

  test "re-uploading the same bytes is idempotent" do
    with_token(TOKEN) { 2.times { post video_path(@step), headers: auth(TOKEN), params: full_params } }

    assert_response :ok
    assert_equal 1, @step.reload.metadata["parsed_sections"].count { |s| s["type"] == "video" }
  end

  # test 8
  test "publishing to a step with recorded work never re-points an attempt" do
    step = step_with_sections([{ "type" => "check" }, { "type" => "concept" }])
    record_attempt!(step, section_index: 0)

    with_token(TOKEN) { post video_path(step), headers: auth(TOKEN), params: full_params }

    assert_response :created
    assert_equal "append", JSON.parse(response.body)["placement"]
    sections = step.reload.metadata["parsed_sections"]
    assert_equal "check", sections[0]["type"],
      "the attempt at index 0 must still name the block it was recorded against"
  end

  # [owner] A :replace is the ONE placement where nothing moves. The step carries
  # both kinds of money — an `image_url` a media job paid for and an `audio_sections`
  # clip a TTS job paid for — and a second upload of DIFFERENT bytes must leave both
  # exactly where they are. Assert the KEYS of audio_sections, because a reindex of
  # a map keyed by index is silent: the clip still plays, under the wrong section.
  test "a re-upload of different bytes replaces in place and reindexes nothing" do
    step = step_with_sections([
      { "type" => "concept", "title" => "Uno", "image_url" => "/paid/uno.png" },
      { "type" => "check", "title" => "Dos" }
    ])
    step.merge_metadata!("audio_sections" => { "1" => { "url" => "/paid/dos.mp3" } })

    with_token(TOKEN) { post video_path(step), headers: auth(TOKEN), params: full_params }
    assert_response :created
    first = JSON.parse(response.body)

    metadata = step.reload.metadata
    frozen_audio = metadata["audio_sections"]
    image_index = metadata["parsed_sections"].index { |s| s["image_url"] == "/paid/uno.png" }

    with_token(TOKEN) do
      post video_path(step), headers: auth(TOKEN), params: base_params.merge(
        video: fixture_upload(mp4_bytes + ("\x01".b * 64), "l.mp4", "video/mp4"),
        subtitles: fixture_upload(srt_bytes, "l.srt", "application/x-subrip")
      )
    end

    assert_response :created
    body = JSON.parse(response.body)
    assert_equal "replace", body["placement"]
    assert_equal first["section_index"], body["section_index"], "a replacement does not move the video"

    sections = step.reload.metadata["parsed_sections"]
    assert_equal 1, sections.count { |s| s["type"] == "video" }
    assert_equal "/paid/uno.png", sections[image_index]["image_url"],
      "the image the media job paid for moved off its own section"
    assert_equal frozen_audio, step.reload.metadata["audio_sections"],
      "audio_sections is keyed by section index; a reindex on a replacement plays a paid clip under the wrong section"
  end

  # ─── Task 7: DELETE ──────────────────────────────────────────────────

  test "unpublishing a prepended video that students have worked past is refused" do
    step = step_with_sections([{ "type" => "check" }])
    with_token(TOKEN) { post video_path(step), headers: auth(TOKEN), params: full_params }
    record_attempt!(step, section_index: 1)
    frozen = step.reload.metadata["parsed_sections"]

    with_token(TOKEN) { delete video_path(step), headers: auth(TOKEN) }

    assert_response :conflict
    assert_equal(
      "students have recorded work on this step; re-upload replaces the video, " \
      "unpublish would re-point their attempts",
      JSON.parse(response.body)["error"]
    )
    assert step.reload.lesson_video.attached?, "a refusal must change nothing"
    assert_equal frozen, step.reload.metadata["parsed_sections"]
  end

  test "unpublishing is allowed when the video is last" do
    step = step_with_sections([{ "type" => "check" }])
    record_attempt!(step, section_index: 0)
    with_token(TOKEN) { post video_path(step), headers: auth(TOKEN), params: full_params }

    with_token(TOKEN) { delete video_path(step), headers: auth(TOKEN) }

    assert_response :no_content
    assert_not step.reload.lesson_video.attached?
  end
end
