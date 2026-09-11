# frozen_string_literal: true

module ContentEngine
  # The keys inside `parsed_sections` that are written by JOBS, not by the parser.
  #
  # `LessonSectionParser` is the author of that array, but it is not the only
  # writer: `MediaPrefetchJob` and `SectionImageJob` reach into the SAME entries
  # and store what they generated there. The parser always emits
  # `image_url: nil` for a visual, so any rewrite from a fresh parse silently
  # deletes them — and `MediaPrefetchJob#build_media_tasks` then queues a PAID
  # regeneration for every visual whose `image_url` is blank.
  #
  # That is why `wp24:reparse_scenarios` was never run: the fix it shipped would
  # have cost the price of every illustration in production, twice.
  #
  # A NEW JOB KEY GOES HERE. `Wp33ReparseTest` greps the jobs for writes into
  # `parsed[...]["key"]` and fails if it finds one this list does not name — so
  # the next job to store something in a section cannot quietly reopen this.
  #
  # `mermaid_invalid` is deliberately absent: WP-35 §7 deleted the validation
  # that wrote it, and nothing has ever read it. It is not an enrichment key.
  module SectionEnrichment
    KEYS = %w[image_url image_status image_error image_fallback].freeze

    module_function

    # Copy every enrichment key from the old array onto the new one, index by
    # index, when the new parse has nothing to say. The parser wins where it
    # produced a value; the jobs win everywhere else.
    #
    # Positional, because `block_attempts.section_index` is positional. The
    # caller has already checked that the two arrays are position-compatible;
    # this does not re-check, it just refuses to read past the end.
    def carry_over(old_sections, new_sections)
      Array(new_sections).each_with_index.map do |section, index|
        old = Array(old_sections)[index]
        next section unless old.is_a?(Hash) && section.is_a?(Hash)

        carried = section.dup
        KEYS.each do |key|
          carried[key] = old[key] if carried[key].blank? && old[key].present?
        end
        carried
      end
    end

    # How many entries carry a usable image URL. The census prints this for the
    # old array and the new one: if the two ever differ, the reparse is eating
    # images again.
    def image_url_count(sections)
      Array(sections).count { |s| s.is_a?(Hash) && s["image_url"].present? }
    end
  end
end
