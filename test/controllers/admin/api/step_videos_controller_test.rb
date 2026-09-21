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

  # The audit assertion is here rather than in its own test because this refusal is a
  # `before_action` that RENDERS, which halts the callback chain: an `after_action`
  # audit never runs for it (measured: 0 rows). It is the case that forced
  # `Admin::Api::BaseController` to audit in an `around_action`.
  test "a body over 300 MB is refused with 413" do
    assert_difference -> { OwnerAuditEvent.where(action: "owner.studio_api").count }, 1 do
      with_token(TOKEN) do
        post video_path(@step), headers: auth(TOKEN).merge("CONTENT_LENGTH" => 301.megabytes.to_s),
             params: base_params.merge(video: fixture_upload(mp4_bytes, "l.mp4", "video/mp4"))
      end
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

  # Spec §5 annotates the attachment `# text/vtt or application/x-subrip, <= 1 MB`
  # (design doc :106). The whole-body CONTENT_LENGTH number cannot answer this
  # question — the body carries the film too — so this is the uploaded file's own
  # size. The head of this fixture is a perfectly good SRT, so nothing but the size
  # can be refusing it.
  test "a subtitles file over 1 MB is refused with 413 and nothing is attached" do
    with_token(TOKEN) do
      post video_path(@step), headers: auth(TOKEN), params: base_params.merge(
        video: fixture_upload(mp4_bytes, "l.mp4", "video/mp4"),
        subtitles: fixture_upload(srt_bytes + ("x" * 1.megabyte), "l.srt", "application/x-subrip")
      )
    end

    assert_response :content_too_large
    assert_includes JSON.parse(response.body)["error"], "1 MB", "the message must name the limit"
    assert_not @step.reload.lesson_video.attached?,
      "the subtitle cap is answered before any attach, like every other refusal here"
    assert_not @step.reload.lesson_subtitles.attached?
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

  # [owner, fix round 1] Captions are timed to ONE film. A different video with the
  # previous .srt still attached is not "keeping data": the `<track>` renders, looks
  # authoritative, and drifts further out of sync the longer the clip runs. So a
  # replace that carries no subtitles clears them.
  test "a replace with no subtitles clears the captions of the film it replaced" do
    with_token(TOKEN) { post video_path(@step), headers: auth(TOKEN), params: full_params }
    assert @step.reload.lesson_subtitles.attached?, "test premise: the first upload carried subtitles"

    with_token(TOKEN) do
      post video_path(@step), headers: auth(TOKEN), params: base_params.merge(
        video: fixture_upload(mp4_bytes + ("\x01".b * 64), "l.mp4", "video/mp4")
      )
    end

    assert_response :created
    body = JSON.parse(response.body)
    assert_equal "replace", body["placement"], "test premise: this is the replace path"
    assert_nil body["subtitles_url"]
    assert_not @step.reload.lesson_subtitles.attached?,
      "the previous film's captions are still attached to the new one"
    section = @step.reload.metadata["parsed_sections"].find { |s| s["type"] == "video" }
    assert_nil section["subtitles_url"],
      "the section still points at them, so the <track> renders and looks authoritative"
  end

  test "a replace with subtitles swaps them" do
    with_token(TOKEN) { post video_path(@step), headers: auth(TOKEN), params: full_params }

    with_token(TOKEN) do
      post video_path(@step), headers: auth(TOKEN), params: base_params.merge(
        video: fixture_upload(mp4_bytes + ("\x01".b * 64), "l.mp4", "video/mp4"),
        subtitles: fixture_upload("1\r\n00:00:00,000 --> 00:00:03,000\r\nSegunda toma.\r\n",
                                  "l.srt", "application/x-subrip")
      )
    end

    assert_response :created
    assert_equal "replace", JSON.parse(response.body)["placement"]
    assert @step.reload.lesson_subtitles.attached?

    # Fetched over the URL the section now carries, which is what the student's
    # `<track>` actually requests — a stronger claim than "a blob changed", and it
    # avoids reading `.blob` off a strict-loaded attachment in the test itself.
    #
    # That URL is the engine's gated path now, not an Active Storage proxy URL, so
    # the fetch needs a session. Both halves are asserted: anonymous gets the door,
    # the owner gets the captions. Before F1 the anonymous fetch SUCCEEDED, and that
    # was the bug.
    subtitles_url = JSON.parse(response.body)["subtitles_url"]
    assert_match %r{\A/learning/routes/.+/steps/.+/subtitles\z}, subtitles_url,
      "the studio was handed an Active Storage proxy URL, which answers to anyone"

    get subtitles_url
    assert_redirected_to Core::Engine.routes.url_helpers.sign_in_path

    sign_in_as(@video_user)
    get subtitles_url

    assert_response :success
    assert_includes response.body, "Segunda toma.",
      "the captions of the film that was replaced are still the ones being served"
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

  # [owner, fix round 1] Spec §6 says the base controller records an OwnerAuditEvent
  # "for every call", and a refused unpublish is the most interesting row the studio
  # can produce: it is the studio trying to re-point recorded student work. A 2xx-only
  # audit is exactly blind to it.
  test "a refused unpublish is audited, with its status" do
    step = step_with_sections([{ "type" => "check" }])
    with_token(TOKEN) { post video_path(step), headers: auth(TOKEN), params: full_params }
    record_attempt!(step, section_index: 1)

    assert_difference -> { OwnerAuditEvent.where(action: "owner.studio_api").count }, 1 do
      with_token(TOKEN) { delete video_path(step), headers: auth(TOKEN) }
    end

    assert_response :conflict
    event = OwnerAuditEvent.where(action: "owner.studio_api").order(:created_at).last
    assert_equal 409, event.metadata["status"]
    assert_equal "destroy", event.metadata["action"]
    assert_equal "admin/api/step_videos", event.metadata["controller"]
  end

  # THE ONLY FAILURE PATH, and nothing exercised it. `publish!` raises after the
  # attach — it has to, because the payload carries proxy URLs and those need blobs —
  # so the rescue is what stands between a raise and a half-published step. A blob
  # BUILT IN THIS REQUEST carries `strict_loading` (strict_loading_by_default is on
  # for every environment), and `strict_loading(false)` on the STEP does not reach it;
  # `Blob#purge` then runs `before_destroy { variant_records.destroy_all }`, which
  # lazily loads that association and raises. The refusal became a 500, the video's
  # blob was orphaned in storage, the SUBTITLES stayed attached because the second
  # purge never ran, and the exception path wrote no audit row.
  test "a publish that raises purges what it attached and answers 422, not 500" do
    step = step_with_sections([{ "type" => "concept" }])
    ContentEngine::AiContent.where(route_step: step).destroy_all   # no body to hold a section

    with_token(TOKEN) { post video_path(step), headers: auth(TOKEN), params: full_params }

    assert_response :unprocessable_entity,
      "the rescue must answer, not raise on its own way out"
    step.reload
    assert_not step.lesson_video.attached?, "the video this request attached must be purged"
    assert_not step.lesson_subtitles.attached?,
      "the SECOND purge is the one a raise in the first one skips"
  end

  test "a publish that raises is still audited" do
    step = step_with_sections([{ "type" => "concept" }])
    ContentEngine::AiContent.where(route_step: step).destroy_all

    assert_difference -> { OwnerAuditEvent.where(action: "owner.studio_api").count }, 1 do
      with_token(TOKEN) { post video_path(step), headers: auth(TOKEN), params: full_params }
    end
  end

  # A VTT signature line may carry a description, and a legal one can be longer than
  # the 64-byte window the validator reads. Requiring a line break before looking for
  # WEBVTT refused it — a valid file, rejected for being descriptive.
  test "a VTT whose signature line is longer than the read window is accepted" do
    header = "WEBVTT - Subtítulos en español para la lección de la tercera persona"
    assert_operator header.bytesize, :>, 64, "test premise: the signature line must exceed the window"
    step = step_with_sections([{ "type" => "concept" }])

    with_token(TOKEN) do
      post video_path(step), headers: auth(TOKEN), params: base_params.merge(
        video: fixture_upload(mp4_bytes, "l.mp4", "video/mp4"),
        subtitles: fixture_upload("#{header}\r\n\r\n00:00.000 --> 00:02.000\r\nHola.\r\n",
                                  "l.vtt", "text/vtt")
      )
    end

    assert_response :created
    assert step.reload.lesson_subtitles.attached?, "a legal VTT was refused for having a description"
    assert_equal "text/vtt", step.lesson_subtitles.blob.content_type,
      "the type comes from the bytes, not from what the client declared"
  end

  test "unpublishing is allowed when the video is last" do
    step = step_with_sections([{ "type" => "check" }])
    record_attempt!(step, section_index: 0)
    with_token(TOKEN) { post video_path(step), headers: auth(TOKEN), params: full_params }

    with_token(TOKEN) { delete video_path(step), headers: auth(TOKEN) }

    assert_response :no_content
    assert_not step.reload.lesson_video.attached?
  end

  # ─── Task 10 / F2: the failure path that was not covered ─────────────

  # The class comment promises "Publish, and if it raises, purge what step 2
  # attached". It kept that promise for exactly two named exceptions. Anything else
  # — a parser raise inside `reparse` (SectionResolver wraps its own parse in
  # `rescue => e` at section_resolver.rb:72, so they are expected in practice), a
  # lock timeout, a validation failure on the AiContent body — left the blob
  # attached with no section pointing at it, the subtitles attached too, and no
  # audit row at all, because an exception skips the around callback's post-yield
  # code. Exactly the half-published step the ordering exists to forbid.
  test "an unexpected failure purges what it attached, audits, and still raises" do
    original = ContentEngine::LessonVideoPublisher.method(:publish!)
    ContentEngine::LessonVideoPublisher.define_singleton_method(:publish!) do |**_args|
      raise "the publisher fell over"
    end

    assert_raises(RuntimeError) do
      with_token(TOKEN) { post video_path(@step), headers: auth(TOKEN), params: full_params }
    end

    @step.reload
    assert_not @step.lesson_video.attached?, "the film was left attached with no section pointing at it"
    assert_not @step.lesson_subtitles.attached?, "the captions were left behind"

    event = OwnerAuditEvent.where(action: "owner.studio_api").order(:created_at).last
    assert event, "a 500 on the studio's door left no audit row"
    assert_equal 500, event.metadata["status"]
    assert_equal "RuntimeError", event.metadata["error"]
  ensure
    ContentEngine::LessonVideoPublisher.define_singleton_method(:publish!, original)
  end

  # A publish that fails must not take the PREVIOUS publish's row with it, and must
  # not report success either.
  test "the raise is the original error, not whatever the cleanup hit" do
    original = ContentEngine::LessonVideoPublisher.method(:publish!)
    ContentEngine::LessonVideoPublisher.define_singleton_method(:publish!) do |**_args|
      raise ArgumentError, "the original"
    end

    error = assert_raises(ArgumentError) do
      with_token(TOKEN) { post video_path(@step), headers: auth(TOKEN), params: full_params }
    end

    assert_equal "the original", error.message
  ensure
    ContentEngine::LessonVideoPublisher.define_singleton_method(:publish!, original)
  end

  # ─── Task 10 / F7a: the cap that the header check cannot enforce ─────

  # `refuse_oversized_body!` reads CONTENT_LENGTH, and a chunked request does not
  # send one: `request.content_length.to_i` is 0 and the 300 MB gate opens. The film
  # is then buffered to disk and attached regardless of size. This is the same
  # ceiling applied to the bytes that actually arrived, which is the only number
  # that cannot be lied about.
  #
  # The cap is swapped rather than exercised at 300 MB, using the singleton-swap
  # idiom this suite already uses for credentials — writing a third of a gigabyte to
  # a tempfile to assert a comparison is not a better test.
  def with_max_video_bytes(bytes)
    klass = Admin::Api::StepVideosController
    original = klass.method(:max_video_bytes)
    klass.define_singleton_method(:max_video_bytes) { bytes }
    yield
  ensure
    klass.define_singleton_method(:max_video_bytes, original)
  end

  test "a film larger than the cap is refused on its actual size, not its header" do
    with_max_video_bytes(64) do
      with_token(TOKEN) do
        post video_path(@step), headers: auth(TOKEN), params: base_params.merge(
          video: fixture_upload(mp4_bytes, "l.mp4", "video/mp4")
        )
      end
    end

    assert_response :content_too_large
    assert_not @step.reload.lesson_video.attached?,
      "an oversized film was attached before it was refused"
  end

  test "a film inside the cap is still accepted" do
    with_max_video_bytes(mp4_bytes.bytesize) do
      with_token(TOKEN) do
        post video_path(@step), headers: auth(TOKEN), params: base_params.merge(
          video: fixture_upload(mp4_bytes, "l.mp4", "video/mp4")
        )
      end
    end

    assert_response :created
  end
end
