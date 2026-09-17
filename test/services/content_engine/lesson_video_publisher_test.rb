require "test_helper"
require "support/video_lesson_helpers"

# THE CLASS: a rebuild that re-points recorded student work, or that deletes an
# image the media jobs already paid for.
#
# `parsed_sections` is a CACHE the student's page renders from;
# `block_attempts.section_index` indexes into it POSITIONALLY, and so does
# `SectionEnrichment.carry_over`. So inserting a section at index 0 moves every
# recorded attempt onto the wrong block, and a naive rebuild drops the
# `image_url`s — after which `MediaPrefetchJob` buys them again.
#
# Both of those have happened in this codebase (WP-24's never-run reparse task,
# WP-33's whole subject). These six tests are the guard.
class ContentEngine::LessonVideoPublisherTest < ActiveSupport::TestCase
  include VideoLessonHelpers

  test "prepends when the step has no attempts, and carries enrichment forward by one" do
    step = step_with_sections([
      { "type" => "visual", "image_url" => "/paid/for.png", "image_status" => "ready" },
      { "type" => "concept" }
    ])

    result = ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)

    sections = step.reload.metadata["parsed_sections"]
    assert_equal :prepend, result[:placement]
    assert_equal "video", sections[0]["type"]
    assert_equal "/paid/for.png", sections[1]["image_url"],
      "the image moved to index 1 with its section; a positional carry-over would " \
      "have put it on the video at index 0"
    assert_nil sections[0]["image_url"]
  end

  test "appends when the step has attempts, and carries enrichment forward in place" do
    step = step_with_sections([{ "type" => "check" }, { "type" => "visual", "image_url" => "/p.png" }])
    record_attempt!(step, section_index: 0)

    result = ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)
    sections = step.reload.metadata["parsed_sections"]

    assert_equal :append, result[:placement]
    assert_equal "check", sections[0]["type"], "index 0 must still be what the attempt points at"
    assert_equal "/p.png", sections[1]["image_url"]
    assert_equal "video", sections.last["type"]
  end

  # THE MIRROR OF THE UNPUBLISH RULE, AND IT WAS MISSING. Once `at` became the index a
  # reparse produces, an appended video stopped landing at the end of the array: the
  # parser SYNTHESISES trailing sections that are not in the markdown — the summary
  # always, and any leftover `knowledge_checks` (lesson_section_parser.rb:935) — so the
  # video parses in FRONT of them and everything from that index up moves down one.
  #
  # `append` is the placement chosen precisely because the step HAS recorded work, so
  # that is the one path where nothing may move. An attempt can sit at any index that
  # exists in `parsed_sections` (`BlockAttemptsController#create` checks only that the
  # section is there), and `RouteStep#outstanding_blocks_for` matches satisfied attempts
  # to gating blocks by `section_index` alone, ignoring `block_type` — the same
  # reasoning that produced f6ac17c5 for unpublish, applied here.
  test "appending never moves an index a student's attempt already points at" do
    step = step_with_sections(
      [{ "type" => "concept" }, { "type" => "check" }, { "type" => "summary" }],
      body: "## Concepto: Uno\nCuerpo uno.\n\n## Pregunta: Q1\nA) a\nB) b\nCORRECTA: A\nEXPLICACIÓN: e\n"
    )
    record_attempt!(step, section_index: 2, block_type: "summary")

    result = ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)
    sections = step.reload.metadata["parsed_sections"]

    assert_equal :append, result[:placement]
    assert_equal "summary", sections[2]["type"],
      "index 2 is what the attempt names; an append must not slide the video under it"
    assert_equal "video", sections.last["type"],
      "the video belongs after everything that already existed, because everything that " \
      "already existed may be pointed at"
    assert_equal sections.length - 1, result[:section_index]
  end

  test "the census image count is unchanged by a publish" do
    step = step_with_sections([{ "type" => "visual", "image_url" => "/a.png" },
                               { "type" => "visual", "image_url" => "/b.png" }])
    before = ContentEngine::SectionEnrichment.image_url_count(step.metadata["parsed_sections"])

    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)

    after = ContentEngine::SectionEnrichment.image_url_count(step.reload.metadata["parsed_sections"])
    assert_equal before, after,
      "a rebuild that loses an image is a rebuild that makes MediaPrefetchJob buy it again"
  end

  test "unpublish refuses when students have recorded work and the video is not last" do
    step = step_with_sections([{ "type" => "check" }])
    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)   # prepended
    record_attempt!(step, section_index: 1)                                      # on the check
    frozen = step.reload.metadata["parsed_sections"]

    assert_equal :conflict, ContentEngine::LessonVideoPublisher.unpublish!(step: step)
    assert_equal frozen, step.reload.metadata["parsed_sections"], "nothing may change on a refusal"
  end

  test "a re-upload edits in place and reports replace, not prepend or append" do
    step = step_with_sections([{ "type" => "check" }, { "type" => "visual", "image_url" => "/p.png" }])
    first = ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)  # prepend
    record_attempt!(step, section_index: 1)                                             # on the check

    second = ContentEngine::LessonVideoPublisher.publish!(
      step: step, payload: payload.merge(video_url: "/rails/active_storage/blobs/proxy/zzz/new.mp4")
    )
    sections = step.reload.metadata["parsed_sections"]

    assert_equal :prepend, first[:placement]
    assert_equal :replace, second[:placement],
      "a re-upload edits the existing section in place; calling it a prepend or an append " \
      "would be a lie about whether anything moved"
    assert_equal first[:section_index], second[:section_index], "nothing moved, so the index is the same"
    assert_equal "/rails/active_storage/blobs/proxy/zzz/new.mp4", sections[second[:section_index]]["video_url"]
    assert_equal "check", sections[1]["type"], "the attempt at index 1 must still name its own block"
    assert_equal "/p.png", sections[2]["image_url"], "enrichment carried positionally, offset 0"
  end

  # THE VIDEO'S OWN INDEX IS NOT SAFE TO IGNORE, and the first version of this
  # refusal ignored it. `BlockAttemptsController#create` records an attempt for ANY
  # index that exists in `parsed_sections` — it checks `section.blank?` and nothing
  # else — and `BlockAttemptRecorder#record_submission!` sets `completed_at`
  # UNCONDITIONALLY on its non-gradable branch (:86), so a submission at a video's
  # index is a SATISFIED attempt. `RouteStep#outstanding_blocks_for` then matches
  # satisfied attempts to gating sections by `section_index` alone, ignoring
  # `block_type` (:169). So removing the video slides the next section into that
  # index and the student is credited for a gating block they never answered.
  # `GATING_TYPES` gates progression, not row creation; that is why the condition is
  # `>=` and not `>`.
  test "unpublish refuses when work is recorded at the video's own index" do
    step = step_with_sections([{ "type" => "check" }])
    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)   # prepended
    record_attempt!(step, section_index: 0, block_type: "video")                 # ON the video
    frozen = step.reload.metadata["parsed_sections"]

    assert_equal :conflict, ContentEngine::LessonVideoPublisher.unpublish!(step: step),
      "a satisfied attempt at the video's index would credit whatever section slid " \
      "into that index; outstanding_blocks_for matches on the index alone"
    assert_equal frozen, step.reload.metadata["parsed_sections"], "nothing may change on a refusal"
  end

  # FOUND BY THE REGRESSION SWEEP, ON A REAL STEP, AND I CAUSED IT. Once
  # `parse_heading_video` learned to keep prose that follows the payload (it has to —
  # 8 of 10 real lesson bodies begin with a paragraph, and prepending a video heading
  # puts that paragraph in the video's section), the unpublish strip started deleting
  # it: `VIDEO_SECTION` runs to the next `##`, so removing "the section" removed the
  # author's intro along with it. Measured on dev step 07e88fda — a 14-section lesson
  # came back as a 13-section body, permanently incompatible with its own cache.
  #
  # Unpublish removes the heading and the payload. It does not remove the lesson.
  test "unpublish keeps the prose that followed the video's payload" do
    intro = "¿Sabías que la evaluación final es la llave para certificar tu nivel?"
    step = step_with_sections([{ "type" => "concept" }],
                              body: "#{intro}\n\n## Concepto: Uno\nCuerpo.\n")
    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)
    content = ContentEngine::SectionResolver.lesson_content_for(step)
    assert_includes content.reload.body, intro, "test premise: the prose is in the body after a publish"

    ContentEngine::LessonVideoPublisher.unpublish!(step: step)

    assert_includes content.reload.body, intro,
      "unpublish deleted the author's paragraph along with the video's payload"
    assert_not_includes content.body, "video_url",
      "the payload itself must be gone"
    assert_not_includes content.body, "## Video:", "the heading must be gone"
  end

  test "unpublish is allowed when the video is last, even with attempts" do
    step = step_with_sections([{ "type" => "check" }])
    record_attempt!(step, section_index: 0)
    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)   # appended

    assert_equal :ok, ContentEngine::LessonVideoPublisher.unpublish!(step: step)
    assert_equal "check", step.reload.metadata["parsed_sections"][0]["type"]
  end

  # ─── Fix round 1 ─────────────────────────────────────────────────────
  #
  # `metadata["audio_sections"]` is the SAME positional hazard as `image_url`,
  # one key over: a Hash keyed by the parsed_sections index AS A STRING, written
  # by media_prefetch_job.rb:201,208,221,227, section_audio_generation_job.rb:49,
  # section_audio_controller.rb:119 and section_audio_generator.rb:241, read by
  # section_audio_controller.rb:48 as `metadata.dig("audio_sections", i.to_s)`
  # with the index `_lesson.html.erb:182` passes into each partial from its
  # `each_with_index`. A prepend that leaves the map alone plays every paid TTS
  # clip under the wrong section, leaves the last section with none, and has it
  # generated again.

  test "the audio map moves down with the sections a prepend pushes down" do
    step = step_with_sections([{ "type" => "concept" }, { "type" => "visual", "image_url" => "/p.png" }])
    step.merge_metadata!("audio_sections" => {
      "0" => { "status" => "ready", "url" => "/paid/concept.mp3" },
      "1" => { "status" => "ready", "url" => "/paid/visual.mp3" }
    })

    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)

    metadata = step.reload.metadata
    assert_equal %w[video concept visual], metadata["parsed_sections"].map { |s| s["type"] }
    assert_equal({ "1" => { "status" => "ready", "url" => "/paid/concept.mp3" },
                   "2" => { "status" => "ready", "url" => "/paid/visual.mp3" } },
      metadata["audio_sections"],
      "every clip must still be keyed by the index of the section it was generated from; " \
      "an unshifted map plays the concept's clip under the video")
  end

  test "the audio map moves back up when an unpublish removes the video at 0" do
    step = step_with_sections([{ "type" => "concept" }, { "type" => "visual" }])
    step.merge_metadata!("audio_sections" => {
      "0" => { "status" => "ready", "url" => "/paid/concept.mp3" },
      "1" => { "status" => "ready", "url" => "/paid/visual.mp3" }
    })
    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)   # prepended

    # Pinned, or the round trip passes on a map that was never touched at all.
    assert_equal %w[1 2], step.reload.metadata["audio_sections"].keys.sort,
      "the prepend must have moved the two clips down before the unpublish moves them back"

    assert_equal :ok, ContentEngine::LessonVideoPublisher.unpublish!(step: step)

    metadata = step.reload.metadata
    assert_equal %w[concept visual], metadata["parsed_sections"].map { |s| s["type"] }
    assert_equal({ "0" => { "status" => "ready", "url" => "/paid/concept.mp3" },
                   "1" => { "status" => "ready", "url" => "/paid/visual.mp3" } },
      metadata["audio_sections"], "the mirror of the prepend: every clip comes back with its section")
  end

  # Not one of the six tests above looks at the body, which is how a cache that
  # claims the video is last while the markdown puts it second-to-last got
  # written: `ensure_summary` SYNTHESIZES the trailing summary (parser:974),
  # so "the end of the body" and "the end of the array" are different places.
  # A cache the body contradicts is permanently skipped by wp33:reparse
  # (rake:149,253) and makes `unpublish!`'s "the video is last" allowance a
  # decision taken against an array nothing else agrees with.
  test "the persisted cache agrees with a reparse of the body, for every placement" do
    body = "## Concepto: A\nUno.\n\n## Concepto: B\nDos.\n"

    step = consistent_step(body)
    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)
    assert_equal reparsed_types(step), cached_types(step), "prepend"

    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload.merge(video_url: "/b.mp4"))
    assert_equal reparsed_types(step), cached_types(step), "replace"

    assert_equal :ok, ContentEngine::LessonVideoPublisher.unpublish!(step: step)
    assert_equal reparsed_types(step), cached_types(step), "unpublish, video at 0"

    # AN APPEND IS THE ONE PLACEMENT THAT DELIBERATELY DIVERGES, so the divergence is
    # asserted rather than quietly excluded. `old.length` is past every section the
    # parser synthesises, so no edit to the markdown can put the heading there — and
    # an append happens only when the step HAS recorded work, where not moving an
    # existing index outranks agreeing with the body. See `insertion_index`.
    appended = consistent_step(body)
    record_attempt!(appended, section_index: 0)
    assert_equal :append, ContentEngine::LessonVideoPublisher.publish!(step: appended, payload: payload)[:placement]
    assert_equal "video", cached_types(appended).last,
      "an append puts the video after everything that already existed"
    assert_not_equal reparsed_types(appended), cached_types(appended),
      "if these now agree, `insertion_index` stopped forcing an append to the end of the " \
      "array — check that it did not start moving indices a student's attempt names"
    assert_equal reparsed_types(appended).sort, cached_types(appended).sort,
      "the two may disagree about WHERE the video is and about nothing else"

    # An authored `## Resumen:` means `ensure_summary` synthesizes nothing, so an
    # appended video really is the last section — the one shape in which the
    # unpublish allowance fires on a step with recorded work.
    authored = consistent_step("## Concepto: A\nUno.\n\n## Resumen:\n- Punto uno\n")
    record_attempt!(authored, section_index: 0)
    ContentEngine::LessonVideoPublisher.publish!(step: authored, payload: payload)
    assert_equal "video", cached_types(authored).last, "the authored summary leaves the video last"
    assert_equal :ok, ContentEngine::LessonVideoPublisher.unpublish!(step: authored)
    assert_equal reparsed_types(authored), cached_types(authored), "unpublish, video last"
  end

  test "a re-upload does not carry the old video's enrichment onto the new one" do
    step = step_with_sections([{ "type" => "check" }])
    first = ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)
    sections = step.reload.metadata["parsed_sections"]
    sections[first[:section_index]] =
      sections[first[:section_index]].merge("image_url" => "/paid/old-video.png", "image_status" => "ready")
    step.merge_metadata!("parsed_sections" => sections)

    second = ContentEngine::LessonVideoPublisher.publish!(
      step: step, payload: payload.merge(video_url: "/rails/active_storage/blobs/proxy/zzz/new.mp4")
    )

    replaced = step.reload.metadata["parsed_sections"][second[:section_index]]
    assert_nil replaced["image_url"], "the video's own index receives nothing, in every case"
    assert_nil replaced["image_status"]
  end

  # Two verified ways for the body to carry a heading the cache knows nothing
  # about: a `## Video:` whose JSON is followed by prose with no sub-heading /
  # fence / rule terminator parses as a CONCEPT (measured), so any reparse leaves
  # a cache with no video over a body that has the heading; and
  # content_generation_job.rb:36 / content_pipeline_job.rb:152 each `create!` a
  # second AiContent row without deleting the first, which `lesson_content_for`
  # then picks between over a uuid primary key with no ORDER BY.
  test "unpublish strips a video heading the cache does not know about" do
    body = "## Video: T\n{\"video_url\":\"/a.mp4\"}\nProsa que el autor escribió después.\n\n" \
           "## Concepto: X\nCuerpo.\n"
    step = step_with_sections([{ "type" => "concept" }], body: body)

    assert_equal :ok, ContentEngine::LessonVideoPublisher.unpublish!(step: step)

    content = ContentEngine::SectionResolver.lesson_content_for(step)
    assert_no_match(/##\s+V(?:i|í)deo:/, content.reload.body,
      "Task 7 purges the blob; a heading left in the markdown is resurrected as a dead " \
      "<video> the next time parse_and_persist! fires on an empty cache")
    assert_equal [{ "type" => "concept" }], step.reload.metadata["parsed_sections"],
      "the cache held no video, so nothing positional may move"
  end

  # ─── Fix round 2 ─────────────────────────────────────────────────────
  #
  # The refusal exists to stop recorded work from being re-pointed, and work at an
  # index BELOW the removal point cannot move. Now that `at` is the index a reparse
  # produces, an appended video sits before the synthesized summary, so the literal
  # "the video is the last section" reading refuses forever on any step with work —
  # the opposite of what the allowance was for. This is the shape that has no test
  # in the six: a step whose cache IS a parse of its own body, so the parse-derived
  # index is the one used.
  test "unpublish is allowed when the recorded work all sits above the video" do
    step = consistent_step("## Concepto: A\nUno.\n\n## Pregunta: ¿Cuál es la capital?\nA) Lisboa\nB) Madrid\nCORRECTA: A\n")
    assert_equal %w[concept check summary], cached_types(step)
    step.merge_metadata!("audio_sections" => {
      "0" => { "status" => "ready", "url" => "/paid/concept.mp3" },
      "2" => { "status" => "ready", "url" => "/paid/summary.mp3" }
    })
    record_attempt!(step, section_index: 1)                                      # on the check

    published = ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)
    assert_equal :append, published[:placement]
    assert_equal 3, published[:section_index],
      "an append lands at the end of the ARRAY, past the synthesized summary, so that no " \
      "index an attempt already names can move"

    assert_equal :ok, ContentEngine::LessonVideoPublisher.unpublish!(step: step),
      "the only attempt sits at index 1, below the video at 2, so removing the video moves nothing " \
      "that any attempt names"

    metadata = step.reload.metadata
    assert_equal %w[concept check summary], metadata["parsed_sections"].map { |s| s["type"] }
    assert_equal "check", metadata["parsed_sections"][1]["type"],
      "the attempt at index 1 must still name its own block"
    assert_equal({ "0" => { "status" => "ready", "url" => "/paid/concept.mp3" },
                   "2" => { "status" => "ready", "url" => "/paid/summary.mp3" } },
      metadata["audio_sections"],
      "the summary's clip moved down with it on the publish and back up on the unpublish; " \
      "the concept's, below the video, never moved")
  end

  private

  # A step whose cache is exactly what a parse of its body produces — the state a
  # generated step is in, and the state the six fixtures above deliberately are not.
  def consistent_step(body)
    step_with_sections(ContentEngine::LessonSectionParser.call(body).map(&:as_json), body: body)
  end

  # The same parse `wp33_reparse.rake:39` performs (body, metadata, audio_url), which
  # is what a rebuild of this cache would actually run.
  def reparsed_types(step)
    content = ContentEngine::SectionResolver.lesson_content_for(step).reload
    ContentEngine::LessonSectionParser.call(
      content.body, metadata: step.reload.metadata, audio_url: content.audio_url
    ).map { |section| section[:type] }
  end

  def cached_types(step) = step.reload.metadata["parsed_sections"].map { |section| section["type"] }
end
