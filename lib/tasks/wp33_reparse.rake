# frozen_string_literal: true

# WP-33: the parses already persisted in production.
#
# `ContentPipelineJob#stage_section_parsing!` and `SectionResolver#parse_and_persist!`
# write `metadata["parsed_sections"]`, and `StepsController#show` renders from that
# cache when it exists. So EVERY parser fix since WP-24 §2 — scenario, flashcards,
# code_playground, fill_blank, simulation, and now check, drag_drop and the
# titles — changes nothing a student can see on a lesson that already exists,
# until its cache is rewritten.
#
# This replaces `wp24:reparse_scenarios`, which was never run and must not be:
# it rewrote the array from a fresh parse, and the parser emits `image_url: nil`
# for a visual while two jobs store their generated URLs inside those same
# entries. Every illustrated step would have lost its images and had them bought
# again. See ContentEngine::SectionEnrichment.
#
#   bin/rails wp33:reparse_census    read only, changes nothing
#   bin/rails wp33:reparse           rewrites the position-compatible ones
#
# A RAKE TASK, NOT A MIGRATION: `bin/docker-entrypoint:16` runs `db:prepare` on
# EVERY boot, so a migration that rewrote content would run itself on the next
# deploy, before anyone had read the census.
#
# POSITION COMPATIBILITY IS THE WHOLE SAFETY RULE. `block_attempts.section_index`
# indexes into the persisted array, so rewriting a step whose new parse has a
# different section count — or a different type at any index — silently
# re-points every recorded attempt at a different block. Those steps are skipped
# and listed, never rewritten.
namespace :wp33 do
  # Resolved the way SectionResolver#lesson_content does, so the census parses
  # exactly what the app would parse.
  resolve_content = lambda do |step|
    target = step.content_type_exercise? ? :exercise : :text
    scope = ContentEngine::AiContent.where(route_step: step)
    scope.by_type(target).first || scope.first
  end

  reparse = lambda do |step, content, metadata|
    ContentEngine::LessonSectionParser.call(
      content.body, metadata: metadata || {}, audio_url: content.audio_url
    ).map(&:as_json)
  end

  # Same length, and the same type at every index. Titles and contents may change
  # — that is the point — but nothing may move.
  compatible = lambda do |old_sections, new_sections|
    old_sections.size == new_sections.size &&
      old_sections.each_with_index.all? { |s, i| s["type"] == new_sections[i]["type"] }
  end

  # EVERY step with a persisted array, not just the ones with a scenario. The
  # scenario-only selection was right for WP-24 §2 and wrong for everything
  # since: a step whose check swallowed a diagram has no scenario in it.
  parsed_steps = lambda do
    LearningRoutesEngine::RouteStep.where("jsonb_array_length(metadata->'parsed_sections') > 0")
  end

  # What changed, by section type, so the census says something an owner can act
  # on rather than a single number.
  diff_by_type = lambda do |old_sections, new_sections, tally|
    old_sections.each_with_index do |old, i|
      fresh = new_sections[i]
      next if fresh.nil?

      tally[:changed_types][old["type"]] += 1 if old != fresh
      tally[:aftermath_gained][old["type"]] += 1 if old["aftermath"].blank? && fresh["aftermath"].present?
      tally[:titles_freed] += 1 if old["title"].present? && fresh["title"].blank?
    end
  end

  desc "Report what a reparse would change, and what it cannot safely touch (read only)"
  task reparse_census: :environment do
    tally = {
      changed_types: Hash.new(0), aftermath_gained: Hash.new(0), titles_freed: 0
    }
    scanned = 0
    changed_steps = 0
    incompatible = []
    unparseable = []
    images_now = 0
    images_after = 0

    parsed_steps.call.find_each(batch_size: 100) do |step|
      scanned += 1
      content = resolve_content.call(step)
      next unparseable << step.id if content.nil? || content.body.blank?

      old_sections = step.metadata["parsed_sections"]
      new_sections = reparse.call(step, content, step.metadata)

      unless compatible.call(old_sections, new_sections)
        # The two SHAPES, not just the two sizes: a step can have the same
        # number of sections and a different type at one index, and
        # "15 sections -> 15" tells the owner nothing about why it was skipped.
        incompatible << [
          step.id,
          old_sections.map { |x| x["type"] }.join(","),
          new_sections.map { |x| x["type"] }.join(",")
        ]
        next
      end

      carried = ContentEngine::SectionEnrichment.carry_over(old_sections, new_sections)
      images_now += ContentEngine::SectionEnrichment.image_url_count(old_sections)
      images_after += ContentEngine::SectionEnrichment.image_url_count(carried)

      changed_steps += 1 if old_sections != carried
      diff_by_type.call(old_sections, carried, tally)
    end

    puts "steps with a persisted parse:         #{scanned}"
    puts "  steps whose parse would change:     #{changed_steps}"
    puts "  NOT position-compatible (skipped):  #{incompatible.size}"
    puts "  no usable AiContent (skipped):      #{unparseable.size}"
    puts
    puts "sections that would change, by type:"
    if tally[:changed_types].empty?
      puts "  (none)"
    else
      tally[:changed_types].sort_by { |_, n| -n }.each { |type, n| puts "  #{type.to_s.ljust(18)} #{n}" }
    end
    puts
    puts "aftermath recovered, by type:"
    if tally[:aftermath_gained].empty?
      puts "  (none)"
    else
      tally[:aftermath_gained].sort_by { |_, n| -n }.each { |type, n| puts "  #{type.to_s.ljust(18)} #{n}" }
    end
    puts
    puts "titles going from a baked-in literal to nil: #{tally[:titles_freed]}"
    puts
    # THE NUMBER THAT PROVES THE CARRY-OVER. These must be equal. If the second
    # is smaller, the reparse is deleting images the media jobs paid for and the
    # next MediaPrefetchJob run will buy them again.
    puts "image urls now:            #{images_now}"
    puts "image urls after reparse:  #{images_after}"
    puts "  ^ these must be EQUAL. If not, STOP and do not run wp33:reparse." if images_now != images_after

    if incompatible.any?
      puts
      puts "incompatible steps — rewriting these would re-point recorded block_attempts:"
      incompatible.each do |id, was, now|
        puts "  #{id}"
        puts "    persisted: #{was}"
        puts "    reparsed:  #{now}"
      end
    end

    if unparseable.any?
      puts
      puts "steps with no usable AiContent:"
      unparseable.each { |id| puts "  #{id}" }
    end

    puts
    puts "Nothing was modified. Run wp33:reparse to rewrite the compatible ones."
  end

  desc "Rewrite parsed_sections for every step whose new parse is position-compatible"
  task reparse: :environment do
    rewritten = 0
    unchanged = 0
    skipped = []
    lost = []
    images_now = 0
    images_after = 0

    parsed_steps.call.find_each(batch_size: 100) do |step|
      content = resolve_content.call(step)
      next skipped << step.id if content.nil? || content.body.blank?

      # UNDER THE LOCK, AND RE-READ. The task read this row possibly minutes ago,
      # and MediaPrefetchJob / SectionImageJob write the same array concurrently
      # in production. Reading, parsing and writing from a stale copy is exactly
      # how an image URL written in between gets erased — the same discipline
      # MediaPrefetchJob#apply_results! documents in its own RE-READ comment.
      step.with_lock do
        metadata = step.fresh_metadata
        old_sections = metadata["parsed_sections"]
        next skipped << step.id unless old_sections.is_a?(Array) && old_sections.any?

        new_sections = reparse.call(step, content, metadata)

        unless compatible.call(old_sections, new_sections)
          skipped << step.id
          next
        end

        carried = ContentEngine::SectionEnrichment.carry_over(old_sections, new_sections)

        # THE INVARIANT IS CHECKED HERE, per row, inside the lock.
        #
        # `reparse_census` tells the operator these two numbers "must be EQUAL. If
        # not, STOP and do not run wp33:reparse" — and this task used to only
        # accumulate them and print them at the very end, with no comparison and no
        # abort. So if `SectionEnrichment::KEYS` ever stops covering what the jobs
        # write, every row is rewritten and the images are gone by the time the
        # number the operator was told to check appears on screen. A number printed
        # after the writes is a post-mortem, not a safety check.
        before_urls = ContentEngine::SectionEnrichment.image_url_count(old_sections)
        after_urls = ContentEngine::SectionEnrichment.image_url_count(carried)
        images_now += before_urls
        images_after += after_urls

        if after_urls < before_urls
          lost << [step.id, before_urls, after_urls]
          next
        end

        # Idempotent: re-running changes nothing once the cache is current.
        if old_sections == carried
          unchanged += 1
          next
        end

        # merge_metadata!, not update!(metadata: ...merge): the second writes the
        # WHOLE jsonb blob from the copy this process is holding, so any other key
        # a job wrote in the meantime — audio_sections, content_ready — is erased.
        step.merge_metadata!("parsed_sections" => carried)
        rewritten += 1
      end
    end

    puts "rewritten:            #{rewritten}"
    puts "already current:      #{unchanged}"
    puts "skipped (unsafe):     #{skipped.size}"
    skipped.each { |id| puts "  #{id}" }
    puts
    puts "image urls now:            #{images_now}"
    puts "image urls after reparse:  #{images_after}"

    if lost.any?
      puts
      puts "REFUSED — these steps would lose an image url, so they were NOT rewritten:"
      lost.each { |id, was, now| puts "  #{id}  #{was} -> #{now}" }
      puts
      puts "SectionEnrichment::KEYS no longer covers everything the jobs write into"
      puts "parsed_sections. Add the missing key and run this again; nothing above"
      puts "was lost, and these rows are untouched."
      # Non-zero exit: this task gets run from a deploy script, where a refusal
      # that only prints is a refusal nobody sees.
      abort "wp33:reparse refused #{lost.size} step(s)"
    end
  end
end
