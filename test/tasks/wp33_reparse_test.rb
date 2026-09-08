require "test_helper"
require "rake"

# THE CLASS: a rewrite of `parsed_sections` loses a key the parser did not
# produce.
#
# WP-24 §2 shipped `wp24:reparse_scenarios` and it was never run, for this
# reason. The task rewrites the array from a fresh parse, and the parser always
# emits `image_url: nil` for a visual — but `MediaPrefetchJob` and
# `SectionImageJob` store their results INSIDE that same array. Every
# illustrated step passes the position guard (the arrays differ, because of the
# URL), is rewritten without its images, and `MediaPrefetchJob`'s task builder
# then queues a PAID regeneration for each of them:
#
#   if type == "visual" && section["image_url"].blank?
#
# So the fix that was supposed to be free would have cost the price of every
# illustration in production, twice: once to lose them, once to buy them again.
class Wp33ReparseTest < ActiveSupport::TestCase
  VISUAL = { "type" => "visual", "title" => "Diagram", "body" => "A diagram of the cycle.",
             "image_description" => "the cycle" }.freeze
  CONCEPT = { "type" => "concept", "title" => "Concept", "body" => "Some prose." }.freeze

  BODY = <<~MARKDOWN.freeze
    ## Concepto: Concept
    Some prose.

    ## Visual: Diagram
    A diagram of the cycle.

    ## Visual: Second
    Another diagram.
  MARKDOWN

  def setup
    Rake::Task.clear
    Rails.application.load_tasks

    @user = create_test_user(email_verified_at: Time.current)
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Cycles", locale: "es", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    @step = @route.route_steps.create!(
      route_module: preview, title: "Lesson", position: 0, status: :in_progress,
      content_type: :lesson, level: :nv1, bloom_level: 1
    )
    ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: BODY)
  end

  def teardown
    Rake::Task.clear
  end

  # ── The defect ──────────────────────────────────────────────────────────

  test "a reparse keeps the image keys the jobs wrote" do
    persist_with_enrichment!

    run_task("wp33:reparse")

    sections = @step.reload.metadata["parsed_sections"]
    first = sections.find { |s| s["title"] == "Diagram" } || sections[1]
    second = sections.find { |s| s["title"] == "Second" } || sections[2]

    assert_equal "https://cdn.example.test/one.png", first["image_url"],
      "the reparse threw away an image the media job had already paid for"
    assert_equal "ready", first["image_status"]
    assert_equal true, second["image_fallback"]
    assert_equal "https://cdn.example.test/fallback.svg", second["image_url"]
  end

  # The consequence, stated as the thing that costs money.
  test "after a reparse the media job queues no image work for the step" do
    persist_with_enrichment!

    run_task("wp33:reparse")

    job = ContentEngine::MediaPrefetchJob.new
    job.instance_variable_set(:@route, @route)
    job.instance_variable_set(:@user, @user)
    job.instance_variable_set(:@step, @step.reload)
    tasks = job.send(:build_media_tasks, @step.reload.metadata["parsed_sections"])

    assert_equal [], tasks.select { |t| %i[image cached_image].include?(t[:type]) },
      "the reparse blanked image_url, so every illustration would be generated again"
  end

  test "the census reports the same number of image urls before and after" do
    persist_with_enrichment!

    output = capture_task("wp33:reparse_census")

    assert_match(/image urls now:\s+2/, output)
    assert_match(/image urls after reparse:\s+2/, output)
    assert_no_match(/image urls after reparse:\s+0/, output)
  end

  # ── The safety rule, moved from the WP-24 test ──────────────────────────

  test "an incompatible step is skipped and reported, not rewritten" do
    # One section persisted where the body parses to three: rewriting would
    # re-point every recorded block_attempt at a different block.
    @step.update!(metadata: { "parsed_sections" => [CONCEPT.dup] })

    output = capture_task("wp33:reparse")

    assert_equal [CONCEPT], @step.reload.metadata["parsed_sections"],
      "an incompatible step was rewritten; recorded attempts now point elsewhere"
    assert_match(/skipped/i, output)
    assert_match(/#{@step.id}/, output)
  end

  test "reparse is idempotent" do
    persist_with_enrichment!
    run_task("wp33:reparse")
    after_first = @step.reload.metadata["parsed_sections"]

    output = capture_task("wp33:reparse")

    assert_equal after_first, @step.reload.metadata["parsed_sections"]
    assert_match(/already current:\s+1/, output)
  end

  test "the census modifies nothing" do
    persist_with_enrichment!
    before = @step.reload.metadata["parsed_sections"]

    capture_task("wp33:reparse_census")

    assert_equal before, @step.reload.metadata["parsed_sections"]
  end

  # ── The race the lock exists for ────────────────────────────────────────
  #
  # The task reads a step, parses it, and writes — and in production
  # MediaPrefetchJob and SectionImageJob write the same array concurrently. A
  # write from a stale copy erases whatever landed in between. The WP-19 harness
  # pattern: hold the row, let the job write, then let the task through.
  test "an image url written between the read and the write survives" do
    persist_with_enrichment!
    third_url = "https://cdn.example.test/written-in-between.png"

    # A job writes a NEW url onto the first visual while the task is mid-flight.
    LearningRoutesEngine::RouteStep.transaction do
      LearningRoutesEngine::RouteStep.lock.find(@step.id)
      metadata = @step.fresh_metadata
      sections = metadata["parsed_sections"]
      visual = sections.index { |s| s["type"] == "visual" }
      sections[visual]["image_url"] = third_url
      @step.merge_metadata!("parsed_sections" => sections)
    end

    run_task("wp33:reparse")

    urls = @step.reload.metadata["parsed_sections"].filter_map { |s| s["image_url"] }
    assert_includes urls, third_url,
      "the task wrote from a copy it read before the job did; the url is gone"
  end

  # ── The sweep that stops the next job reopening it ──────────────────────

  test "every key a job writes into parsed_sections is declared as enrichment" do
    written = Dir[Rails.root.join("engines/*/app/jobs/**/*.rb")].flat_map do |path|
      File.read(path).scan(/parsed(?:_sections)?\[[^\]]+\]\["([a-z_]+)"\]\s*=/).flatten
    end.uniq

    assert_not_empty written, "the sweep found no writes at all; it has stopped looking"
    assert_equal [], written - ContentEngine::SectionEnrichment::KEYS,
      "a job writes a key into parsed_sections that the reparse does not carry over, " \
      "so the next reparse will delete it. Add it to SectionEnrichment::KEYS."
  end

  private

  def persist_with_enrichment!
    sections = ContentEngine::LessonSectionParser.call(BODY).map(&:as_json)
    visuals = sections.each_index.select { |i| sections[i]["type"] == "visual" }
    sections[visuals[0]]["image_url"] = "https://cdn.example.test/one.png"
    sections[visuals[0]]["image_status"] = "ready"
    sections[visuals[1]]["image_url"] = "https://cdn.example.test/fallback.svg"
    sections[visuals[1]]["image_fallback"] = true
    @step.update!(metadata: { "parsed_sections" => sections })
  end

  def run_task(name)
    capture_task(name)
  end

  def capture_task(name)
    task = Rake::Task[name]
    task.reenable
    out = StringIO.new
    original = $stdout
    $stdout = out
    task.invoke
    out.string
  ensure
    $stdout = original
  end
end
