# frozen_string_literal: true

# WP-24 §2: the scenario parses already persisted in production.
#
# `ContentPipelineJob#stage_section_parsing!` and `SectionResolver#parse_and_persist!`
# write `metadata["parsed_sections"]`, and `StepsController#show` renders from that
# cache when it exists. So the parser fix alone changes NOTHING a student can see
# on a lesson that already exists — every broken scenario stays broken until its
# cache is rewritten.
#
# A RAKE TASK, NOT A MIGRATION: `bin/docker-entrypoint:16` runs `./bin/rails
# db:prepare` on EVERY boot, so a migration that rewrote content would run itself
# on the next deploy, before anyone had seen the census.
#
#   bin/rails wp24:scenario_census      read only, changes nothing
#   bin/rails wp24:reparse_scenarios    rewrites the position-compatible ones
#
# POSITION COMPATIBILITY IS THE WHOLE SAFETY RULE. `block_attempts.section_index`
# indexes into the persisted array, so rewriting a step whose new parse has a
# different section count — or a different type at any index — silently re-points
# every recorded attempt at a different block. Those steps are skipped and listed,
# never rewritten.
namespace :wp24 do
  # Resolved the way SectionResolver#lesson_content does, so the census parses
  # exactly what the app would parse.
  resolve_content = lambda do |step|
    target = step.content_type_exercise? ? :exercise : :text
    scope = ContentEngine::AiContent.where(route_step: step)
    scope.by_type(target).first || scope.first
  end

  reparse = lambda do |step, content|
    ContentEngine::LessonSectionParser.call(
      content.body, metadata: step.metadata || {}, audio_url: content.audio_url
    ).map(&:as_json)
  end

  # Same length, and the same type at every index. Titles and contents may change
  # — that is the point — but nothing may move.
  compatible = lambda do |old_sections, new_sections|
    old_sections.size == new_sections.size &&
      old_sections.each_with_index.all? { |s, i| s["type"] == new_sections[i]["type"] }
  end

  scenario_steps = lambda do
    LearningRoutesEngine::RouteStep
      .where("metadata->'parsed_sections' @> ?", [{ type: "scenario" }].to_json)
  end

  # What actually changes for a student: a consequence that used to swallow the
  # rest of the section, and the aftermath that was inside it.
  scenario_diff = lambda do |old_sections, new_sections|
    changed = false
    recovered = false

    old_sections.each_with_index do |old, i|
      next unless old["type"] == "scenario"

      fresh = new_sections[i]
      next if fresh.nil? || fresh["type"] != "scenario"

      changed ||= old["options"].to_a.map { |o| o["consequence"] } !=
                  fresh["options"].to_a.map { |o| o["consequence"] }
      recovered ||= old["aftermath"].blank? && fresh["aftermath"].present?
    end

    [changed, recovered]
  end

  desc "Count scenario steps whose parse changes, and which cannot be safely rewritten (read only)"
  task scenario_census: :environment do
    scanned = 0
    changed_count = 0
    recovered_count = 0
    incompatible = []
    unparseable = []

    scenario_steps.call.find_each(batch_size: 100) do |step|
      scanned += 1
      content = resolve_content.call(step)
      next unparseable << step.id if content.nil? || content.body.blank?

      old_sections = step.metadata["parsed_sections"]
      new_sections = reparse.call(step, content)

      unless compatible.call(old_sections, new_sections)
        incompatible << [step.id, old_sections.size, new_sections.size]
        next
      end

      changed, recovered = scenario_diff.call(old_sections, new_sections)
      changed_count += 1 if changed
      recovered_count += 1 if recovered
    end

    puts "steps with a persisted scenario:      #{scanned}"
    puts "  consequences would change:          #{changed_count}"
    puts "  an aftermath would be recovered:    #{recovered_count}"
    puts "  NOT position-compatible (skipped):  #{incompatible.size}"
    puts "  no usable AiContent (skipped):      #{unparseable.size}"

    if incompatible.any?
      puts
      puts "incompatible steps — rewriting these would re-point recorded block_attempts:"
      incompatible.each { |id, was, now| puts "  #{id}  #{was} sections -> #{now}" }
    end

    if unparseable.any?
      puts
      puts "steps with no usable AiContent:"
      unparseable.each { |id| puts "  #{id}" }
    end

    puts
    puts "Nothing was modified. Run wp24:reparse_scenarios to rewrite the compatible ones."
  end

  desc "Rewrite parsed_sections for scenario steps whose new parse is position-compatible"
  task reparse_scenarios: :environment do
    rewritten = 0
    unchanged = 0
    skipped = []

    scenario_steps.call.find_each(batch_size: 100) do |step|
      content = resolve_content.call(step)
      next skipped << step.id if content.nil? || content.body.blank?

      old_sections = step.metadata["parsed_sections"]
      new_sections = reparse.call(step, content)

      unless compatible.call(old_sections, new_sections)
        skipped << step.id
        next
      end

      # Idempotent: re-running changes nothing once the cache is current.
      if old_sections == new_sections
        unchanged += 1
        next
      end

      step.update!(metadata: step.metadata.merge("parsed_sections" => new_sections))
      rewritten += 1
    end

    puts "rewritten:            #{rewritten}"
    puts "already current:      #{unchanged}"
    puts "skipped (unsafe):     #{skipped.size}"
    skipped.each { |id| puts "  #{id}" }
  end
end
