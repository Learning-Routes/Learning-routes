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

  test "unpublish is allowed when the video is last, even with attempts" do
    step = step_with_sections([{ "type" => "check" }])
    record_attempt!(step, section_index: 0)
    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)   # appended

    assert_equal :ok, ContentEngine::LessonVideoPublisher.unpublish!(step: step)
    assert_equal "check", step.reload.metadata["parsed_sections"][0]["type"]
  end
end
