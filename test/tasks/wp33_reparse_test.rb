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

  # ── §1-§4 together, which is what the owner will actually run ───────────
  #
  # A step persisted BEFORE this package: its check swallowed the diagram, its
  # match lost the intro, its titles were baked in Spanish, and its visual has a
  # paid image URL. One `wp33:reparse` must fix the first three without touching
  # the fourth.
  test "one reparse recovers the aftermath, the intro and the titles, and keeps the image" do
    body = <<~MARKDOWN
      ## Visual:
      A diagram of the cycle.

      ## Pregunta:
      A) Yes
      B) No
      CORRECTA: A

      ```mermaid
      flowchart TD
        A --> B
      ```

      ## Match:
      Drag each term onto its definition.
      Dog ==> Perro
      Cat ==> Gato
    MARKDOWN
    ContentEngine::AiContent.where(route_step: @step).update_all(body: body)

    # The OLD shape: what the parser produced before WP-33, plus the image the
    # media job paid for.
    stale = ContentEngine::LessonSectionParser.call(body).map(&:as_json)
    stale.each do |section|
      section["aftermath"] = nil
      section["intro"] = nil
      section["title"] = { "visual" => "Visual", "check" => "Comprueba tu conocimiento",
                           "drag_drop" => "Match", "summary" => "Resumen",
                           "concept" => "Concepto" }[section["type"]]
    end
    stale[0]["image_url"] = "https://cdn.example.test/cycle.png"
    stale[0]["image_status"] = "ready"
    @step.update!(metadata: { "parsed_sections" => stale })

    run_task("wp33:reparse")

    sections = @step.reload.metadata["parsed_sections"]
    check = sections.find { |s| s["type"] == "check" }
    match = sections.find { |s| s["type"] == "drag_drop" }
    visual = sections.find { |s| s["type"] == "visual" }

    assert_includes check["aftermath"].to_s, "```mermaid",
      "the diagram the check used to swallow was not recovered"
    assert_equal "Drag each term onto its definition.", match["intro"],
      "the prose above the board was not recovered"
    assert_nil check["title"], "a baked-in Spanish default survived the reparse"
    assert_nil match["title"]
    assert_equal "https://cdn.example.test/cycle.png", visual["image_url"],
      "the reparse recovered the text and threw away the image"
    assert_equal "ready", visual["image_status"]
    assert_equal stale.size, sections.size, "the section count changed"
    assert_equal stale.map { |s| s["type"] }, sections.map { |s| s["type"] },
      "a type moved; every recorded block_attempt would now point elsewhere"
  end

  # ── The sweep that stops the next job reopening it ──────────────────────

  # JOBS ARE NOT THE ONLY WRITERS, which is the whole lesson of this branch:
  # the first version of this sweep globbed `app/jobs` only, and
  # `SectionImagesController` was reaching into the same entries the whole time.
  # A glob narrower than the set of writers is a sweep that certifies what it
  # has not looked at.
  WRITER_GLOB = "engines/*/app/{jobs,controllers,services}/**/*.rb".freeze

  # UNBOUND FROM THE LOCAL NAME. This was `parsed(?:_sections)?\[...`, so a
  # writer that happened to call its local `sections` or `entries` was invisible.
  # What identifies an enrichment write is its SHAPE — index, then a string key,
  # then assignment — not what the caller named its variable.
  #
  # The double bracket is what keeps `audio_sections[index] = entry` out: that
  # is a single-bracket write of a whole entry, a different key at the top level
  # of the blob, and not enrichment. Verified: this pattern and the old one
  # return the same four keys today, over 116 files instead of 60-odd.
  # `=(?!=)` and not `=`: `parsed[i]["type"] == "visual"` is a comparison, and
  # matching it reports a READ as an undeclared enrichment write — failing the
  # class test below with a message that sends the reader to SectionEnrichment::KEYS
  # for a key nothing writes.
  ENRICHMENT_WRITE = /\w+\[[^\]]+\]\["([a-z_]+)"\]\s*=(?!=)/

  test "every key written into parsed_sections is declared as enrichment" do
    written = Dir[Rails.root.join(WRITER_GLOB)].flat_map do |path|
      File.read(path).scan(ENRICHMENT_WRITE).flatten
    end.uniq

    assert_not_empty written, "the sweep found no writes at all; it has stopped looking"
    assert_equal [], written - ContentEngine::SectionEnrichment::KEYS,
      "something writes a key into parsed_sections that the reparse does not carry " \
      "over, so the next reparse will delete it. Add it to SectionEnrichment::KEYS."
  end

  test "the sweep is looking at the writers it thinks it is" do
    files = Dir[Rails.root.join(WRITER_GLOB)]

    assert_operator files.size, :>=, 100,
      "the glob stopped matching the tree; the class test above would pass vacuously"
    assert files.any? { |f| f.end_with?("section_images_controller.rb") },
      "the controller that writes image_status is outside the glob again"
  end

  # ── The census counts what rule (a) would cost, before anyone adopts it ───
  #
  # `parse_heading_drag_drop` still has the variant of finding 3 the check just
  # lost: `Cat ==> Gato`, a blank line, then `The arrow ==> means "maps to".`
  # yields a third pair. Unlike a check it cannot be fixed with a grammar —
  # every pair looks identical, so nothing distinguishes prose about the arrow
  # from a pair using it. The honest fix is to end the board at the first blank
  # line, which is the shape `lesson_content.yml` shows, and it is only safe if
  # no board in production is written with its pairs spaced out.
  #
  # So the census counts them and the board rule stays as it is. A number the
  # owner can read BEFORE the change, rather than a change justified by a guess.
  test "the census counts persisted boards whose pairs are separated by blank lines" do
    @step.update!(metadata: { "parsed_sections" => [spaced_board, tight_board] })

    out = run_task("wp33:reparse_census")

    assert_match(/match boards persisted:\s+2/, out)
    assert_match(/with pairs separated by blank lines:\s+1/, out,
      "exactly one of the two fixtures has a blank line between its pairs")
  end

  test "the census counts no blank-separated board when every board is tight" do
    @step.update!(metadata: { "parsed_sections" => [tight_board] })

    out = run_task("wp33:reparse_census")

    assert_match(/match boards persisted:\s+1/, out)
    assert_match(/with pairs separated by blank lines:\s+0/, out,
      "a tight board must not be counted; rule (a) would not touch it")
  end

  test "a blank line inside the aftermath does not count as a spaced board" do
    # The blank that matters is one BETWEEN pairs. A board whose pairs are tight
    # and whose trailing prose is separated from them by a blank is the ordinary
    # shape, and counting it would tell the owner rule (a) is unsafe when it is
    # not.
    @step.update!(metadata: { "parsed_sections" => [tight_board_with_aftermath] })

    out = run_task("wp33:reparse_census")

    assert_match(/with pairs separated by blank lines:\s+0/, out)
  end

  test "a mermaid arrow inside a fence does not make a board look spaced" do
    @step.update!(metadata: { "parsed_sections" => [tight_board_with_fenced_arrow] })

    out = run_task("wp33:reparse_census")

    assert_match(/with pairs separated by blank lines:\s+0/, out,
      "the `==>` inside the fence is not a pair, so the blank line above the " \
      "fence is not a blank line between pairs"
    )
  end

  # ── Finding 7: the safety invariant is checked, not narrated ──────────────
  #
  # `reparse_census` tells the operator the two image counts "must be EQUAL. If
  # not, STOP and do not run wp33:reparse". `wp33:reparse` only accumulated them
  # and printed them at the very end, with no comparison and no abort — so if
  # `SectionEnrichment::KEYS` ever misses a key, every row is rewritten and the
  # images are already gone by the time the number is visible.
  test "a reparse that would lose an image url skips the row instead of reporting it afterwards" do
    persist_with_enrichment!
    kept = @step.reload.metadata["parsed_sections"].map { |s| s["image_url"] }.compact
    assert_not_empty kept, "the fixture must start with images to lose"

    # KEYS missing a key, simulated at the one seam that decides it.
    original = ContentEngine::SectionEnrichment.method(:carry_over)
    ContentEngine::SectionEnrichment.define_singleton_method(:carry_over) { |_old, fresh| fresh }
    begin
      out = capture_task_allowing_exit("wp33:reparse")
    ensure
      ContentEngine::SectionEnrichment.define_singleton_method(:carry_over, original)
    end

    after = @step.reload.metadata["parsed_sections"].map { |s| s["image_url"] }.compact
    assert_equal kept, after,
      "the task rewrote the row and the images are gone. The invariant the census " \
      "tells the operator to check was only printed after every write had landed."
    assert_match(/would lose/i, out,
      "the run has to say which rows it refused, or the operator cannot tell a " \
      "clean run from a skipped one")
  end

  # ── Finding 9: the sweep matches writes, not comparisons ──────────────────
  test "the enrichment sweep matches writes and not comparisons" do
    assert_match ENRICHMENT_WRITE, %q(parsed[i]["image_url"] = url),
      "the sweep must still see a real enrichment write"
    assert_no_match ENRICHMENT_WRITE, %q(if parsed[i]["type"] == "visual"),
      "`==` is a comparison, not a write: one anywhere under the glob fails the " \
      "class test above with a message telling the reader to add a key to " \
      "SectionEnrichment::KEYS, which is not the problem"
    assert_no_match ENRICHMENT_WRITE, %q(return unless h["a"]["b"] == x)
  end

  private

  def board(body)
    ContentEngine::LessonSectionParser.call("## Match: Board\n#{body}")
      .find { |x| x[:type] == "drag_drop" }.as_json
  end

  def spaced_board
    board("Dog ==> Perro\n\nCat ==> Gato\n")
  end

  def tight_board
    board("Dog ==> Perro\nCat ==> Gato\n")
  end

  def tight_board_with_aftermath
    board("Dog ==> Perro\nCat ==> Gato\n\nSay each one out loud.\n")
  end

  def tight_board_with_fenced_arrow
    board("Dog ==> Perro\nCat ==> Gato\n\n```mermaid\ngraph LR\n  A ==> B\n```\n")
  end

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

  # `wp33:reparse` aborts when it refused a row, so the operator gets a non-zero
  # exit in a deploy script. The output is still what the test asserts on.
  def capture_task_allowing_exit(name)
    task = Rake::Task[name]
    task.reenable
    out = StringIO.new
    original = $stdout
    $stdout = out
    begin
      task.invoke
    rescue SystemExit
      # the abort under test
    end
    out.string
  ensure
    $stdout = original
  end
end
