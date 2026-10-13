# frozen_string_literal: true

module ContentEngine
  # Puts the studio's finished film into a lesson, and takes it out again: it edits
  # the `## Video:` section of the AiContent body AND rebuilds the positional
  # structures that index into `parsed_sections`, in one transaction, without
  # re-pointing recorded student work and without dropping media the jobs paid for.
  #
  # WHY THIS SERVICE EXISTS AT ALL
  #
  # `SectionResolver.call` returns the persisted `parsed_sections` and only parses
  # when there are none, so it cannot refresh a generated step. `parse_and_persist!`
  # is private (its one caller is `section_resolver.rb:46`) AND writes a fresh parse
  # with no `carry_over`, so calling it would delete the `image_url`s the media jobs
  # paid for — after which `MediaPrefetchJob#build_media_tasks` queues a paid
  # regeneration for every visual whose `image_url` is blank. `wp33:reparse` reaches
  # the same parse through its own lambda (`wp33_reparse.rake:39`) and wraps every
  # write in `carry_over` (rake:161,258) for exactly that reason.
  #
  # WHAT IS POSITIONAL, AND THEREFORE WHAT MOVES
  #
  # `block_attempts.section_index` indexes into `parsed_sections` positionally, and
  # so do two things this service has to move with it:
  #
  #   - the enrichment keys inside each section (`SectionEnrichment::KEYS`), which
  #     travel with their own section because the section hash travels;
  #   - `metadata["audio_sections"]`, a Hash keyed by the section index AS A STRING.
  #     Written by media_prefetch_job.rb:201,208,221,227,
  #     section_audio_generation_job.rb:49, section_audio_controller.rb:119 and
  #     section_audio_generator.rb:241; read by section_audio_controller.rb:48 as
  #     `metadata.dig("audio_sections", section_index.to_s)`, with the index
  #     `_lesson.html.erb:182` passes into each partial from its `each_with_index`.
  #     Leaving that map alone is the same money-and-position defect as `image_url`,
  #     one key over: the paid TTS clip plays under whatever section moved into its
  #     index, and the section it belongs to has none and is generated again.
  #
  # THE ONE OFFSET RULE
  #
  # Every placement is one insertion, one replacement or one removal at a single
  # index `at`, and the whole safety argument is the offset that follows from it:
  #
  #   insertion at `at`:   old[i] -> fresh[i]      for i < at
  #                        old[i] -> fresh[i + 1]  for i >= at
  #   removal   at `at`:   old[i] -> fresh[i]      for i < at
  #                        old[i] -> fresh[i - 1]  for i > at
  #   replacement at `at`: old[i] -> fresh[i]      for every i, and `at` itself
  #                        receives NOTHING — see below
  #
  # and the same offsets reindex the keys of `audio_sections`. The rows the brief
  # tabulated are consequences of that one rule, not separate cases:
  #
  # | Operation               | `at`          | Carry                      | Why                                          |
  # |-------------------------|---------------|----------------------------|----------------------------------------------|
  # | `:prepend`              | 0             | `old[i]` -> `fresh[i + 1]`  | every old section moved down one             |
  # | `:append`               | end of a parse| `old[i]` -> `fresh[i]`      | nothing before it moved                      |
  # | `:replace`              | the cache's video | `old[i]` -> `fresh[i]`  | same length, same indices                    |
  # | `unpublish`, video at 0 | 0             | `old[i]` -> `fresh[i - 1]`  | every section moved up one                   |
  # | `unpublish`, video last | end           | `old[i]` -> `fresh[i]`      | nothing moved                                |
  # | `unpublish`, refused    | —             | nothing is written at all   | a refusal that rewrites metadata is not one  |
  #
  # Those two unpublish rows are the extremes, not the only cases: a removal from the
  # middle is allowed whenever no recorded work sits above it, and it carries
  # `old[i] -> fresh[i - 1]` for that part of the array. See `unpublish!`.
  #
  # In every case the video's own index receives nothing: the aligned source array
  # holds `nil` there, which `carry_over` skips (`next section unless old.is_a?(Hash)`),
  # and `audio_sections` drops that key.
  #
  # WHAT `carry_over` DOES HERE, PLAINLY
  #
  # Today it copies NOTHING. This service splices the persisted section hashes
  # across untouched (see below), so the enrichment is already on the sections it
  # belongs to; deleting the two `carry_over` calls leaves every test in
  # `lesson_video_publisher_test.rb` green (measured). What the ALIGNMENT enforces
  # is the other half: that nothing is ever carried ACROSS the insertion point onto
  # the video. Replace the aligned source with a plain positional `old` and the
  # prepend test goes red because the paid-for image lands on the video at index 0.
  # The call stays because spec §4 names it and because it becomes load-bearing the
  # moment anyone rebuilds the surrounding sections from a parse again.
  #
  # The census test that guards this is one-sided, and its message overstates it:
  # with a splice an image cannot be lost, only duplicated, so an unequal count
  # means a carry ACROSS the video, never a dropped `image_url`.
  #
  # ONE SECTION CHANGES, AND ONLY ONE
  #
  # The sections around the video are the PERSISTED ones, copied across untouched;
  # only the video section itself comes from the parser. A fresh parse of the whole
  # body can return a different array than the cache it would replace — that is why
  # `wp33:reparse` refuses to write a step whose shapes differ (`compatible`,
  # rake:47, checked at rake:149,253) — and an upload that silently rewrote every
  # other section would re-point attempts for a reason that has nothing to do with
  # the video.
  #
  # WHERE THE VIDEO GOES: THE PARSER DECIDES, NOT `placement`
  #
  # `ensure_summary` (parser:974) SYNTHESIZES a trailing summary that appears in no
  # markdown, so "the end of the body" and "the end of the array" are different
  # places. Measured: a body whose cache is `["concept", "concept", "summary"]`
  # parses, after the video is appended to the markdown, to
  # `["concept", "concept", "video", "summary"]`. Writing the video last would leave
  # the cache claiming the video is last while the body says second-to-last, which
  # makes the step permanently shape-incompatible for `wp33:reparse`, makes
  # `unpublish!`'s decision about what sits above the video a decision taken against
  # an array the body contradicts, and shifts the video's index the moment anything rebuilds
  # `parsed_sections` from the body. So `at` is read off the parse of the edited
  # body — for every placement, with no case for the summary.
  #
  # The parser's index is a fact about THIS cache only while the cache is what a
  # parse of this body produces. When the two already disagree — reachable, see
  # `unpublish!` — that index is not about this array at all, so the video goes to
  # the end `placement` names and the cache changes by exactly one element either
  # way. Same guard, and the same definition of "compatible", as rake:47.
  #
  # NOT DONE HERE: the Active Storage attachment. The caller attaches the blobs and
  # passes their proxy URLs in; on `:ok` from `unpublish!` the caller purges them,
  # and on `:conflict` it must not. Storage IO does not belong in this transaction.
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
        # Both sources re-read inside the lock: `content_engine_ai_contents` has no
        # `lock_version`, so a body read before the lock would let the loser of two
        # concurrent publishes overwrite the winner's markdown from a stale copy.
        content.reload
        metadata = @step.fresh_metadata
        old = sections_in(metadata)

        existing = old.index { |section| video?(section) }
        placement = if existing then :replace
        elsif attempts? then :append
        else :prepend
        end

        body = edited_body(content.body, markdown, at_end: placement == :append)
        parse = reparse(body, content, metadata)
        section = video_section!(parse)
        at = placement == :replace ? existing : insertion_index(parse, old, content, metadata, placement)

        if placement == :replace
          # Replacement at `at`: same length, same indices, and `nil` at `at` so the
          # new video inherits nothing the old one was carrying there.
          fresh = old.dup.tap { |sections| sections[at] = section }
          aligned = old.dup.tap { |sections| sections[at] = nil }
          shift = 0
        else
          # Insertion at `at`: old[i] -> fresh[i] below it, old[i] -> fresh[i + 1]
          # from it on. The `nil` spliced into the source array at the same index
          # is what produces both halves, and is what the video reads from.
          fresh = old.dup.tap { |sections| sections.insert(at, section) }
          aligned = old[0...at] + [nil] + old[at..]
          shift = 1
        end

        write!(content, body, SectionEnrichment.carry_over(aligned, fresh),
               reindexed_audio(metadata["audio_sections"], at: at, shift: shift))
        outcome = { section_index: at, placement: placement }
      end

      outcome
    end

    # Returns `:ok` when the video is gone from both the cache and the body, and
    # `:conflict` when removing it would re-point recorded student work — in which
    # case nothing at all is written.
    def unpublish!
      content = lesson_content!
      outcome = nil

      @step.with_lock do
        content.reload
        metadata = @step.fresh_metadata
        old = sections_in(metadata)
        at = old.index { |section| video?(section) }

        if at && attempts_at_or_after?(at)
          # THE REFUSAL, and why it is this condition rather than "the video is the
          # last section". What the refusal protects is recorded work from being
          # re-pointed, and work at an index BELOW the removal point cannot move.
          # The owner's rule was "zero attempts, or the video is last", with its
          # reason given in the same breath: removing the final index shifts nothing.
          # "No recorded work at or after the video" is that reason applied
          # faithfully; "the video is last" is the special case of it where the set
          # from the video upward is empty by construction.
          #
          # AT, not merely after — and the first version of this condition got that
          # wrong by resting on `BlockGrader::GATING_TYPES`, which gates PROGRESSION
          # and not row creation. `BlockAttemptsController#create` (:13-21) records an
          # attempt for any index present in `parsed_sections`, and
          # `BlockAttemptRecorder#record_submission!` sets `completed_at`
          # unconditionally on its non-gradable branch (:86), so a submission at a
          # video's index IS a satisfied attempt. `RouteStep#outstanding_blocks_for`
          # (:169) then matches satisfied attempts to gating sections by
          # `section_index` alone, ignoring `block_type`. Slide the next section into
          # that index and the student is credited for a gating block they never
          # answered.
          #
          # The literal reading stopped BEING that rule when `at` became the index a
          # reparse produces: an appended video sits before the synthesized summary,
          # so it is never the last element, so the allowance would never fire on any
          # step with recorded work. A rule that never fires is not that rule.
          #
          # A refusal that rewrites metadata is not a refusal. No body edit, no
          # merge_metadata!, nothing: the caller answers 409 with the spec's wording,
          # does NOT purge the blob, and the student's `section_index` values keep
          # meaning what they meant. `at.nil?` falls through to the branch below
          # because there is no removal point, so nothing can sit after one.
          outcome = :conflict
        else
          if at
            # Removal at `at`: old[i] -> fresh[i] below it, old[i] -> fresh[i - 1]
            # above it. Dropping `old[at]` from the source array is what produces
            # the second half — which makes the aligned source equal `fresh`
            # itself here, so this carry is an identity.
            fresh = old.dup.tap { |sections| sections.delete_at(at) }
            aligned = old[0...at] + old[(at + 1)..]
            carried = SectionEnrichment.carry_over(aligned, fresh)
            audio = reindexed_audio(metadata["audio_sections"], at: at, shift: -1)
          end

          write!(content, stripped_body(content.body), carried, audio)
          outcome = :ok
        end
      end

      outcome
    end

    private

    # One write path, so the body and the positional structures are always written
    # together or not at all. `merge_metadata!` (never `update!(metadata:)`) merges
    # inside the database at the top level, so keys nobody here names are read and
    # written by nobody.
    def write!(content, body, sections, audio)
      content.update!(body: body) unless body == content.body
      patch = {}
      patch["parsed_sections"] = sections if sections
      patch["audio_sections"] = audio if audio
      @step.merge_metadata!(patch) if patch.any?
    end

    # The index a reparse of the edited body puts the video at — the same parse a
    # rebuild would run — unless the cache is not what a parse of the CURRENT body
    # produces, in which case that index says nothing about this array and the end
    # `placement` names is used instead. Clamped, because a cache the body
    # contradicts can be shorter than the parse.
    # AN APPEND GOES AT THE END OF THE ARRAY, FULL STOP — never at the index a reparse
    # would produce. `append` is chosen exactly when the step HAS recorded work, so it
    # is the one placement where nothing may move, and the parse index moves things: the
    # parser synthesises trailing sections that are not in the markdown (the summary
    # always, plus any leftover `knowledge_checks`, lesson_section_parser.rb:935), so a
    # video appended to the BODY parses in front of them.
    #
    # That means an append deliberately leaves the cache and the body disagreeing about
    # where the video sits, and the disagreement is UNAVOIDABLE rather than a shortcut:
    # `old.length` is past every section the parser synthesises, so no edit to the
    # markdown can put the heading there. The two properties are in real conflict and
    # this is the ranking — re-pointing a student's recorded work is a live hazard the
    # moment it happens, while a body the cache disagrees with only bites on a rebuild
    # from an emptied cache, and it makes the step position-incompatible so
    # `wp33:reparse` SKIPS it instead of rewriting it (`compatible`, rake:47).
    #
    # A prepend has no such conflict: it only happens at zero attempts, so there is
    # nothing to re-point, and the parse index keeps the two in agreement.
    def insertion_index(parse, old, content, metadata, placement)
      return old.length if placement == :append

      at = parse.index { |section| video?(section) }
      return 0 unless same_shape?(old, reparse(content.body, content, metadata))

      at.clamp(0, old.length)
    end

    # `wp33_reparse.rake:47`'s rule, to the letter: same length, and the same type
    # at every index. Titles and contents may differ; nothing may move.
    def same_shape?(old, parse)
      old.size == parse.size && old.each_with_index.all? { |section, i| section["type"] == parse[i]["type"] }
    end

    # The same parse `wp33_reparse.rake:39` performs, metadata and audio_url
    # included, because those add sections too (`inject_metadata_checks`,
    # `inject_audio_section`) and a rebuild would add them at the same places.
    def reparse(body, content, metadata)
      LessonSectionParser.call(body, metadata: metadata, audio_url: content.audio_url).map(&:as_json)
    end

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
      #
      # If the CACHE holds a video section but the BODY has no heading — reachable only
      # through the duplicate-AiContent nondeterminism named in WP38_HANDOFF.md — the
      # markdown is prepended while the cache updates in place, widening that drift
      # rather than closing it. Left as is: guessing which of two disagreeing sources is
      # right is how the drift got there.
      return body.sub(VIDEO_SECTION) { "#{markdown}\n" } if body.match?(VIDEO_SECTION)
      return "#{body.rstrip}\n\n#{markdown}" if at_end

      "#{markdown}\n#{body.lstrip}"
    end

    # Stripped whenever the BODY carries the heading, whatever the cache says. The
    # two disagree in reachable ways — a `## Video:` whose JSON is followed by
    # prose with no sub-heading / fence / rule terminator parses as a concept
    # (measured), and content_generation_job.rb:36 / content_pipeline_job.rb:152
    # each `create!` a second AiContent row without deleting the first — and a
    # heading left behind after the caller purges the blob is resurrected as a dead
    # player the next time `parse_and_persist!` fires on an empty cache. Nothing
    # positional moves: the cache is written from the cache's own video index, or
    # not written at all.
    #
    # Both this and the `:replace` `sub` discard the section's trailing `aftermath`
    # prose, which `parse_heading_video` deliberately keeps (2624d00). Unreachable
    # through the studio, which writes the heading and one line of JSON and nothing
    # after it; a future author of this heading by hand would lose that tail.
    # Removes the heading and the payload, and keeps what follows the payload.
    #
    # Two shapes it does NOT handle, both unreachable through the studio, which writes
    # the heading and one JSON object with nothing between them: prose sitting BETWEEN
    # the heading and the opening brace is dropped with them (`split_json_object`
    # returns only what follows the closing brace), and a payload whose braces never
    # balance is left in the body, where it would render to the student as prose. Said
    # here rather than claimed away, because "and nothing else" was not true.
    #
    # `sub(VIDEO_SECTION, "")` was wrong and the regression sweep caught it on a real
    # step: that pattern runs to the next `##`, so it also deleted whatever the author
    # had written after the payload. Since `parse_heading_video` keeps that text as the
    # section's `aftermath` — it has to, because 8 of 10 real lesson bodies begin with a
    # paragraph and prepending a video heading puts that paragraph in the video's
    # section — the strip was deleting real lesson content. Dev step 07e88fda came back
    # from an unpublish as a 13-section body under a 14-section cache.
    #
    # The payload's end comes from `LessonSectionParser.split_json_object`, the same
    # method that decides where the parser stops reading. Two answers to that question
    # is what caused this.
    def stripped_body(body)
      body = body.to_s
      section = body[VIDEO_SECTION]
      return body if section.nil?

      _heading, rest = section.split("\n", 2)
      _payload, aftermath = LessonSectionParser.split_json_object(rest.to_s)
      kept = aftermath.to_s.strip
      replacement = kept.empty? ? "" : "#{kept}\n"

      body.sub(section) { replacement }.lstrip
    end

    # The video section as the parser reads it back out of the body we just built,
    # rather than a hash assembled here: the parser is the author of that key set
    # (it gained `aftermath` in 2624d00, nil on this path because the section ends
    # at the next `##`), and a section built by hand would drift from it.
    #
    # The rest of the parse is used for `at` only — the surrounding sections come
    # from the persisted array, see the class comment.
    def video_section!(parse)
      section = parse.find { |parsed| video?(parsed) }
      return section if section

      # `parse_heading_video` degrades to a concept when the body is not a Hash
      # with a `video_url`, so this is a malformed payload, not a parser fault.
      raise UnparsableSection, "step #{@step.id}: the video section did not parse back as a video"
    end

    # `audio_sections` under the same offsets as the array. The video's own index
    # holds no clip afterwards: an insertion leaves it free, a replacement drops
    # what the OLD video had there, and a removal drops the clip of the section
    # that went away. A key that is not an index is left exactly where it is
    # rather than guessed at.
    def reindexed_audio(audio, at:, shift:)
      return nil unless audio.is_a?(Hash) && audio.any?

      audio.each_with_object({}) do |(key, entry), out|
        index = Integer(key.to_s, exception: false)
        if index.nil? || index < at
          out[key] = entry
        elsif index > at || shift.positive?
          out[(index + shift).to_s] = entry
        end
      end
    end

    # Read inside the lock and straight from the row: `merge_metadata!` merges at
    # the top level, so a caller mutating a NESTED structure must re-read it
    # immediately before writing (route_step.rb:66).
    def sections_in(metadata)
      sections = metadata["parsed_sections"]
      sections.is_a?(Array) ? sections : []
    end

    def video?(section) = section.is_a?(Hash) && section["type"] == "video"

    # RouteStep declares no `has_many :block_attempts`; attempts are read through
    # the model, as `RouteStep#outstanding_blocks_for` does.
    def attempts? = LearningRoutesEngine::BlockAttempt.where(route_step: @step).exists?

    # The recorded work a removal at `index` invalidates: everything from `index`
    # upward. Above it moves down one; AT it is left pointing at whatever slides in,
    # which `outstanding_blocks_for` reads as satisfying that section — see the
    # refusal branch for the three lines that make an attempt at a video's index
    # both possible and satisfied.
    def attempts_at_or_after?(index)
      LearningRoutesEngine::BlockAttempt.where(route_step: @step)
                                        .where("section_index >= ?", index).exists?
    end

    def lesson_content!
      SectionResolver.lesson_content_for(@step) ||
        raise(MissingLessonBody, "step #{@step.id} has no AiContent to carry a video section")
    end
  end
end
