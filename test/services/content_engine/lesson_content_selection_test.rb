require "test_helper"
require "rake"
require "support/video_lesson_helpers"

# WP-38 Task 10 / F3. "Where does the lesson body live?" had no stable answer.
#
# `SectionResolver.lesson_content_for` was `scope.by_type(target).first || scope.first`
# with NO `ORDER BY`, and PostgreSQL is free to return those rows in any order it
# likes — physical order today, something else after a VACUUM or a plan change.
# Duplicates are not hypothetical: content_generation_job.rb:36 and
# content_pipeline_job.rb:152 each `create!` a row without deleting an earlier one.
#
# That matters most to LessonVideoPublisher, whose whole correctness rests on the
# row it WROTE being the row SectionResolver READS: its `:replace` branch looks for
# a `## Video:` heading in the body, and `stripped_body` removes a payload from it.
# Point those two at different rows and an unpublish deletes nothing while the cache
# says the video is gone.
class LessonContentSelectionTest < ActiveSupport::TestCase
  include VideoLessonHelpers

  def setup
    Rake::Task.clear
    Rails.application.load_tasks
    @step = create_route_step_for_video
    @original = ContentEngine::AiContent.find_by!(route_step_id: @step.id)
  end

  def teardown
    Rake::Task.clear
  end

  # The second row is INSERTED last but DATED first, so an unordered read returns
  # the newer one (physical order) and an ordered read returns the older one. That
  # is what makes this test fail before the fix rather than pass by luck.
  def add_older_sibling!(content_type: :text)
    sibling = ContentEngine::AiContent.create!(
      route_step: @step, content_type: content_type, body: "El cuerpo verdadero.\n"
    )
    sibling.update_columns(created_at: 2.hours.ago, updated_at: 2.hours.ago)
    sibling
  end

  test "the lesson body is the oldest row, deterministically" do
    older = add_older_sibling!

    assert_equal older.id, ContentEngine::SectionResolver.lesson_content_for(@step).id,
      "the lesson body is whichever row PostgreSQL felt like returning"
  end

  test "the same row comes back every time it is asked for" do
    add_older_sibling!

    answers = 5.times.map { ContentEngine::SectionResolver.lesson_content_for(@step).id }

    assert_equal 1, answers.uniq.size, "the answer changed between two identical reads"
  end

  # The second rule, one file over. AudioGenerator had its OWN `.first`, with a
  # comment already noticing the nondeterminism and a fix that only narrowed it to a
  # content type. Two text rows and it is back — and it writes `audio_url` to
  # whichever row it picked, while the page renders the body of whichever row
  # SectionResolver picked. One rule, or the narration plays under the wrong lesson.
  test "the audio row and the lesson body row are the same row" do
    add_older_sibling!

    audio_row = ContentEngine::AudioGenerator.new(@step).send(:find_or_create_content!)

    assert_equal ContentEngine::SectionResolver.lesson_content_for(@step).id, audio_row.id
  end

  test "a step with no content at all still gets a row to narrate" do
    @original.destroy!

    audio_row = ContentEngine::AudioGenerator.new(@step).send(:find_or_create_content!)

    assert audio_row.persisted?
    assert_equal "text", audio_row.content_type
  end

  # ─── The census ──────────────────────────────────────────────────────
  #
  # Ordering makes the READ deterministic; it does not make the duplicates go away,
  # and a step with two bodies is a step where half the app is looking at content
  # the student cannot see. The census is how that gets counted before it is fixed.

  test "the census is silent when every step has one body per type" do
    out, = capture_io { Rake::Task["wp38:ai_content_census"].invoke }

    assert_match(/0 step\(s\)/, out)
    assert_no_match(/#{@step.id}/, out)
  end

  test "the census names a step carrying two bodies of the same type" do
    add_older_sibling!

    out, = capture_io { Rake::Task["wp38:ai_content_census"].invoke }

    assert_match(/1 step\(s\)/, out)
    assert_match(/#{@step.id}/, out)
    assert_match(/text/, out)
  end

  test "two rows of DIFFERENT types are not a duplicate" do
    add_older_sibling!(content_type: :exercise)

    out, = capture_io { Rake::Task["wp38:ai_content_census"].invoke }

    assert_match(/0 step\(s\)/, out)
  end
end
