# frozen_string_literal: true

module ContentEngine
  # Puts the studio's finished film into a lesson, and takes it out again: it edits
  # the `## Video:` section of the AiContent body AND rebuilds the `parsed_sections`
  # cache, in one transaction, without re-pointing recorded student work and without
  # dropping the image enrichment the media jobs already paid for.
  #
  # WHY THIS SERVICE EXISTS AT ALL
  #
  # `SectionResolver.call` returns the persisted `parsed_sections` and only parses
  # when there are none, so it cannot refresh a generated step. `parse_and_persist!`
  # is private AND writes a fresh parse with no `carry_over`, so calling it would
  # delete the `image_url`s the media jobs paid for — after which
  # `MediaPrefetchJob#build_media_tasks` queues a paid regeneration for every visual
  # whose `image_url` is blank. Verified: `parse_and_persist!`'s only callers are
  # `wp33_reparse.rake:161,258`, and both wrap it in carry-over themselves.
  #
  # THE CARRY-OVER OFFSET, PER PLACEMENT — this is the whole safety argument
  #
  # | Operation            | `fresh` vs `old`          | Carry                  | Why                                                             |
  # |----------------------|---------------------------|------------------------|-----------------------------------------------------------------|
  # | `:prepend`           | video inserted at 0       | `old[i]` -> `fresh[i + 1]` | every old section moved down one; the video receives nothing |
  # | `:append`            | video added at the end    | `old[i]` -> `fresh[i]`     | nothing moved; the video receives nothing                   |
  # | `:replace`           | video edited in place     | `old[i]` -> `fresh[i]`     | same length, same indices; the old video held no enrichment anyway |
  # | `unpublish`, video at 0 | video removed from 0   | `old[i]` -> `fresh[i - 1]` | every section moved up one                                  |
  # | `unpublish`, video last | last element removed   | `old[i]` -> `fresh[i]`     | nothing moved                                               |
  # | `unpublish`, refused | —                         | **nothing is written at all** | a refusal that rewrites metadata is not a refusal        |
  #
  # `SectionEnrichment.carry_over` takes no offset — it is strictly positional
  # because `block_attempts.section_index` is positional, and `wp33_reparse.rake`
  # relies on that contract. So the offsets above are produced by aligning the two
  # arrays at the call site (a `nil` in front of `old`, or a `drop(1)`), never by
  # teaching `carry_over` about them.
  #
  # ONE SECTION CHANGES, AND ONLY ONE
  #
  # The sections around the video are the PERSISTED ones, copied across untouched;
  # only the video section itself comes from the parser. A fresh parse of the whole
  # body can return a different array than the cache it would replace — that is why
  # `wp33_reparse.rake` refuses to write a step whose shapes differ
  # (`compatible.call`, rake:148 and :253) — and an upload that silently rewrote
  # every other section would re-point attempts for a reason that has nothing to do
  # with the video. So the array changes by exactly one element, and the indices an
  # attempt can name are the ones the table above accounts for.
  #
  # The body edit is persisted, not in-memory: `:replace` is decided by finding an
  # existing `## Video:` section in the body, and a body without the video would
  # silently drop it the next time `parse_and_persist!` fires on an empty cache.
  #
  # NOT DONE HERE: the Active Storage attachment. The caller attaches the blobs and
  # passes their proxy URLs in; on `:ok` from `unpublish!` the caller purges them.
  # Storage IO does not belong inside this transaction.
  class LessonVideoPublisher
    # The step has no AiContent row, so there is no body to put a section into.
    class MissingLessonBody < StandardError; end
    # The section we just wrote did not parse back as a video, so the cache would
    # disagree with the body. Raised instead of writing that disagreement.
    class UnparsableSection < StandardError; end

    # `## Video: <title>` down to the next `## ` heading or the end of the body.
    # `##[ \t]` and the `Video:` / `Vídeo:` prefixes are what
    # `LessonSectionParser#extract_heading_type` matches against
    # `LessonBlocks.heading_map`, which holds exactly those two spellings.
    VIDEO_SECTION = /^\#\#[ \t]+V(?:i|í)deo:.*?(?=^\#\#[ \t]|\z)/m

    # The keys `LessonSectionParser#parse_heading_video` reads out of the JSON body.
    # Anything else in the payload (the uploaded files, for instance) is not the
    # section's business.
    PAYLOAD_KEYS = %i[title video_url subtitles_url duration_seconds source lesson_id voice published_at].freeze

    def self.publish!(step:, payload:) = new(step).publish!(payload)
    def self.unpublish!(step:) = new(step).unpublish!

    def initialize(step)
      @step = step
    end

    # Returns `{ section_index:, placement: }`, where placement is `:prepend`,
    # `:append` or `:replace`.
    def publish!(payload)
      content = lesson_content!
      markdown = video_markdown(payload)
      outcome = nil

      @step.with_lock do
        old = persisted_sections
        existing = old.index { |section| video?(section) }
        placement = if existing then :replace
        elsif attempts? then :append
        else :prepend
        end

        body = edited_body(content.body, markdown, at_end: placement == :append)
        section = parsed_video_section(body)

        fresh, aligned_old, index =
          case placement
          when :replace
            # old[i] -> fresh[i]: same length, same indices, so the aligned copy
            # of `old` is `old`.
            [old.dup.tap { |sections| sections[existing] = section }, old, existing]
          when :prepend
            # old[i] -> fresh[i + 1]: one nil in front of `old` shifts every
            # source index down one. `carry_over` skips a non-Hash source
            # (`next section unless old.is_a?(Hash)`), so the video at 0 reads
            # from that nil and receives nothing.
            [[section] + old, [nil] + old, 0]
          when :append
            # old[i] -> fresh[i]: nothing moved. The video sits past the end of
            # `old`, where `carry_over` reads nil and again carries nothing.
            [old + [section], old, old.length]
          end

        carried = SectionEnrichment.carry_over(aligned_old, fresh)

        content.update!(body: body)
        @step.merge_metadata!("parsed_sections" => carried)
        outcome = { section_index: index, placement: placement }
      end

      outcome
    end

    # Returns `:ok` when the video was removed (or there was none), `:conflict`
    # when removing it would re-point recorded student work — in which case
    # nothing at all is written.
    def unpublish!
      content = lesson_content!
      outcome = nil

      @step.with_lock do
        old = persisted_sections
        index = old.index { |section| video?(section) }
        last = old.length - 1

        if index.nil?
          outcome = :ok
        elsif attempts? && index != last
          # A refusal that rewrites metadata is not a refusal. No body edit, no
          # merge_metadata!, nothing: the caller answers 409 and the student's
          # `section_index` values keep meaning what they meant.
          outcome = :conflict
        else
          fresh = old.dup.tap { |sections| sections.delete_at(index) }
          aligned_old =
            if index.zero?
              # Video removed from 0: old[i] -> fresh[i - 1]. Dropping the first
              # element of `old` shifts every source index up one.
              old.drop(1)
            else
              # Video removed from the end: old[i] -> fresh[i]. Nothing moved.
              old
            end

          carried = SectionEnrichment.carry_over(aligned_old, fresh)

          content.update!(body: content.body.to_s.sub(VIDEO_SECTION, "").lstrip)
          @step.merge_metadata!("parsed_sections" => carried)
          outcome = :ok
        end
      end

      outcome
    end

    private

    # The heading carries the title for a human reading the markdown; the JSON
    # body is what the parser reads. One line, so no line of it can look like the
    # sub-heading / fence / rule boundary `split_aftermath` cuts the section at.
    def video_markdown(payload)
      data = payload.to_h.symbolize_keys.slice(*PAYLOAD_KEYS)
      # One line in the heading and the same one line in the JSON: the parser
      # prefers the payload's title over the heading's, so leaving a newline in
      # only one of the two would show a different title than the markdown reads.
      title = data[:title].to_s.gsub(/\s+/, " ").strip
      data[:title] = title.presence

      "## Video:#{" #{title}" if title.present?}\n#{JSON.generate(data)}\n"
    end

    def edited_body(body, markdown, at_end:)
      body = body.to_s
      # A re-upload replaces the section it finds, wherever it is; only a first
      # upload chooses an end.
      return body.sub(VIDEO_SECTION) { "#{markdown}\n" } if body.match?(VIDEO_SECTION)
      return "#{body.rstrip}\n\n#{markdown}" if at_end

      "#{markdown}\n#{body.lstrip}"
    end

    # The video section as the parser reads it back out of the body we just built,
    # rather than a hash assembled here: the parser is the author of that key set
    # (it gained `aftermath` in 2624d00, nil on this path because the section ends
    # at the next `##`), and a section built by hand would drift from it.
    #
    # The rest of this parse is discarded — the surrounding sections come from the
    # persisted array, see the class comment.
    def parsed_video_section(body)
      section = LessonSectionParser.call(body).map(&:as_json).find { |parsed| video?(parsed) }
      return section if section

      # `parse_heading_video` degrades to a concept when the body is not a Hash
      # with a `video_url`, so this is a malformed payload, not a parser fault.
      raise UnparsableSection, "step #{@step.id}: the video section did not parse back as a video"
    end

    # Read inside the lock and straight from the row: `merge_metadata!` merges at
    # the top level, so a caller mutating a NESTED structure must re-read it
    # immediately before writing (route_step.rb:66).
    def persisted_sections
      sections = @step.fresh_metadata["parsed_sections"]
      sections.is_a?(Array) ? sections : []
    end

    def video?(section) = section.is_a?(Hash) && section["type"] == "video"

    # RouteStep declares no `has_many :block_attempts`; attempts are read through
    # the model, as `RouteStep#outstanding_blocks_for` does.
    def attempts? = LearningRoutesEngine::BlockAttempt.where(route_step: @step).exists?

    def lesson_content!
      SectionResolver.lesson_content_for(@step) ||
        raise(MissingLessonBody, "step #{@step.id} has no AiContent to carry a video section")
    end
  end
end
