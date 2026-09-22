# frozen_string_literal: true

module ContentEngine
  class LessonSectionParser
    # Derived from ContentEngine::LessonBlocks — the single source of truth. Do not
    # add a type here without adding it there, or the parser will accept a block it
    # has no partial to render.
    BLOCK_TYPES = LessonBlocks.fence_types.freeze
    IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/
    PARAGRAPHS_PER_SECTION = 3
    CONCEPTS_PER_CHECK = 3

    def self.call(body, metadata: {}, audio_url: nil)
      new(body, metadata: metadata, audio_url: audio_url).parse
    end

    def initialize(body, metadata: {}, audio_url: nil)
      @body = body.to_s
      @metadata = metadata || {}
      @audio_url = audio_url
    end

    def parse
      return [blank_concept_section, empty_summary_section] if @body.blank?

      sections = extract_all_sections
      sections = inject_metadata_checks(sections)
      sections = inject_audio_section(sections)
      sections = ensure_summary(sections)
      sections
    end

    private

    # ── Main extraction pipeline ──────────────────────────────────────

    def extract_all_sections
      # Split the body around :::type blocks, collecting both block sections
      # and the "gap" text between them.
      segments = split_around_blocks
      sections = []

      segments.each do |segment|
        if segment[:block]
          sections << segment[:section]
        else
          sections.concat(parse_freeform(segment[:text]))
        end
      end

      sections
    end

    # Returns an array of { block: true/false, section: hash } or { block: false, text: string }
    def split_around_blocks
      segments = []
      remaining = @body.dup
      block_regex = /^:::(\w+)\s*(.*?)\n(.*?)^:::/m

      while (match = remaining.match(block_regex))
        # Text before this block
        before = match.pre_match
        segments << { block: false, text: before } if before.present?

        block_type = match[1].downcase
        title_or_content = match[2].strip
        body = match[3].strip

        if BLOCK_TYPES.include?(block_type)
          segments << { block: true, section: parse_block(block_type, title_or_content, body) }
        else
          # Unknown block type — DROP it.
          #
          # This used to push match[0] back as freeform text, which meant a block the
          # app cannot render reached the student as a literal ":::tap_pairs" marker
          # mid-lesson. Dropping keeps the lesson coherent; the warn line makes the
          # drift visible to us instead. See WP6_CONTRACT.md §3 for the alternatives
          # considered, and the contract test that is supposed to stop this arising.
          Rails.logger.warn(
            "[LessonSectionParser] Dropped unrenderable block :::#{block_type} — " \
            "not in ContentEngine::LessonBlocks. Body: #{body.to_s.truncate(160).inspect}"
          )
        end

        remaining = match.post_match
      end

      # Remaining text after last block
      segments << { block: false, text: remaining } if remaining.present?
      segments
    end

    # ── ::: block parsers ─────────────────────────────────────────────

    def parse_block(type, title_line, body)
      case type
      when "check"           then parse_check_block(title_line, body)
      when "concept"         then parse_concept_block(title_line, body)
      when "example"         then parse_example_block(title_line, body)
      when "tip"             then parse_tip_block(title_line, body)
      when "summary"         then parse_summary_block(title_line, body)
      when "drag_drop"       then parse_heading_drag_drop(title_line, body)
      when "fill_blank"      then parse_heading_fill_blank(title_line, body)
      when "code_playground" then parse_heading_code_playground(title_line, body)
      when "simulation"      then parse_heading_simulation(title_line, body)
      when "scenario"        then parse_heading_scenario(title_line, body)
      when "flashcards"      then parse_heading_flashcards(title_line, body)
      end
    end

    def parse_check_block(title_line, body)
      # :::check format: first line after :::check = question, then [x]/[ ] options
      full_text = title_line.present? ? "#{title_line}\n#{body}" : body
      lines = full_text.lines.map(&:strip)
      question = lines.shift || ""
      options = []

      lines.each do |line|
        if line.match?(/^-\s*\[[ x]\]/)
          correct = line.include?("[x]")
          label = line.sub(/^-\s*\[[ x]\]\s*/, "").strip
          options << { label: label, correct: correct }
        end
      end

      {
        type: "check",
        title: nil,
        question: question,
        options: options,
        explanation: nil
      }
    end

    def parse_concept_block(title_line, body)
      title = title_line.present? ? title_line : "Concepto"
      section = build_concept_or_visual(title, body)
      section
    end

    def parse_example_block(title_line, body)
      full_body = title_line.present? ? "#{title_line}\n#{body}" : body
      { type: "example", title: nil, body: full_body.strip }
    end

    def parse_tip_block(title_line, body)
      full_body = title_line.present? ? "#{title_line}\n#{body}" : body
      { type: "tip", title: nil, body: full_body.strip }
    end

    def parse_summary_block(title_line, body)
      full_body = title_line.present? ? "#{title_line}\n#{body}" : body
      key_points = full_body.lines
                            .select { |l| l.strip.match?(/^[-*]\s/) }
                            .map { |l| l.strip.sub(/^[-*]\s+/, "") }

      remaining = full_body.lines
                           .reject { |l| l.strip.match?(/^[-*]\s/) }
                           .join.strip

      {
        type: "summary",
        title: nil,
        key_points: key_points,
        body: remaining.presence
      }
    end

    # ── Freeform text parsing (between/outside ::: blocks) ────────────

    def parse_freeform(text)
      return [] if text.blank?

      stripped = text.strip
      return [] if stripped.empty?

      # Try splitting by ## headings first
      heading_sections = split_by_headings(stripped)
      return heading_sections if heading_sections.any?

      # No headings — split by paragraphs
      split_by_paragraphs(stripped)
    end

    # Heading prefix → section type mapping (supports both Spanish and English markers)
    # Derived from ContentEngine::LessonBlocks — see BLOCK_TYPES above.
    HEADING_TYPE_MAP = LessonBlocks.heading_map

    def split_by_headings(text)
      # Only use heading-based splitting if there are actual ## headings
      return [] unless text.match?(/^##\s/m)

      # Split on lines starting with ## (but not ### which is sub-heading)
      parts = text.split(/^(?=##\s)/m)
      sections = []

      parts.each do |part|
        part = part.strip
        next if part.empty?

        if part.match?(/\A##\s/)
          lines = part.lines
          heading_line = lines.shift.strip
          raw_title = heading_line.sub(/^##\s+/, "")
          body = lines.join.strip

          # Detect typed heading: "## Pregunta: What is X?" → type=check, title="What is X?"
          prefix, title = extract_heading_type(raw_title)
          section_type = HEADING_TYPE_MAP[prefix]

          case section_type
          when :check
            sections << parse_heading_check(title, body)
          when :visual
            sections << parse_heading_visual(title, body)
          when :motion
            sections << parse_heading_motion(title, body)
          when :example
            sections << { type: "example", title: title.presence, body: body }
          when :tip
            sections << { type: "tip", title: title.presence, body: body }
          when :summary
            sections << parse_heading_summary(title, body)
          when :concept
            sections << build_concept_or_visual(title.presence, body)
          when :drag_drop
            sections << parse_heading_drag_drop(title, body)
          when :fill_blank
            sections << parse_heading_fill_blank(title, body)
          when :code_playground
            sections << parse_heading_code_playground(title, body)
          when :simulation
            sections << parse_heading_simulation(title, body)
          when :scenario
            sections << parse_heading_scenario(title, body)
          when :flashcards
            sections << parse_heading_flashcards(title, body)
          when :video
            sections << parse_heading_video(title, body)
          else
            # Unknown or untyped heading — use existing logic
            sections << build_concept_or_visual(raw_title, body)
          end
        else
          # Content before the first heading — treat as a concept with generic title
          sections << build_concept_or_visual("Introducción", part) if part.present?
        end
      end

      sections
    end

    # Extract "Pregunta" from "Pregunta: What is the capital?" → ["Pregunta", "What is the capital?"]
    def extract_heading_type(raw_title)
      HEADING_TYPE_MAP.each_key do |prefix|
        if raw_title.start_with?("#{prefix}:")
          title = raw_title.sub(/\A#{prefix}:\s*/, "")
          return [prefix, title]
        end
      end
      [nil, raw_title]
    end

    # Parse ## Pregunta: heading format with A)-D) options, CORRECTA:, EXPLICACIÓN:
    # ## Pregunta / ## Question
    #
    # THE STRUCTURAL LINES COME FIRST, AND AFTER THEM EVERYTHING IS AFTERMATH.
    # A programming check is `## Pregunta ("what does this print?")` followed by
    # a code fence and THEN its options: a fence before the first option is part
    # of the question, not an aftermath. So the question is everything before
    # the first option line, markdown and fences included.
    #
    # After the LAST option / CORRECTA / EXPLICACION line there is nothing
    # structural left to protect, so there is nothing to hunt for either. The
    # first version of this fix ran `split_aftermath` over that tail and dropped
    # its first return value — `_kept` — which deleted any prose sitting between
    # the last marker and the first heading/fence/rule, and deleted the whole
    # tail when there was no terminator at all. That is the same class of loss
    # this method exists to close, reopened one line lower down.
    #
    # Every line that was neither an option, CORRECTA, EXPLICACIÓN nor the first
    # prose line used to be DISCARDED. `lesson_content.yml:127-128` tells the
    # model to put its first mandatory mermaid diagram immediately after the
    # CYCLE 2 block, whose preferred types include `## Pregunta` — so half the
    # time the diagram landed here and was deleted. The section count never
    # changed, which is why no test noticed.
    def parse_heading_check(question_from_heading, body)
      # RAW lines, newlines intact. The previous version mapped `rstrip` over
      # them, which is harmless when you only ever inspect a line and fatal when
      # you re-join a slice: the aftermath came back flattened, which is exactly
      # what stopped a diagram drawing in WP-24 §2.
      lines = body.to_s.lines
      options = []
      correct_letter = nil
      explanation = nil
      first_marker_index = nil
      last_marker_index = nil

      # A MARKER is any structural line: an option (`A)`-`D)`, or a numbered
      # `1)` the generator was never asked for but has produced), CORRECTA, or
      # EXPLICACIÓN. The question ends at the FIRST of them, whatever its kind —
      # the second review round found `1) 4 / 2) 22 / CORRECTA: A` with no
      # `A)` line at all, so nothing ended the question and the modal rendered
      # the answer key to the student.
      #
      # Markers are only recognised OUTSIDE fenced code: a "what does this
      # print?" question carries its sample output in a fence, and a line of
      # that output that happens to start with `A) ` is not an option.
      #
      # THE RUN IS CONTIGUOUS, and that is the part the second round still got
      # wrong. Scanning the whole body made `last_marker_index` mean "the last
      # line ANYWHERE that looked structural", so trailing prose that merely
      # opens like a marker — `Answer: think about it before moving on.` — moved
      # the aftermath boundary past everything above it. A real diagram was
      # deleted and `correct_letter` was overwritten with prose, which leaves no
      # option marked correct and makes `BlockGrader` treat the check as
      # unanswerable. So the run stops at the first line that is neither a
      # marker, a blank, nor the wrapped rest of the marker above it.
      #
      # A wrapped value belongs to ITS MARKER, not to the lesson. Only the first
      # line of `EXPLICACIÓN:` was captured; the rest fell past the last marker
      # into the aftermath, which `_aftermath.html.erb` renders always and
      # ungated under the check — so the tail of the explanation printed in the
      # lesson before the student had answered.
      in_fence = false
      prev_structural = false
      last_kind = nil

      lines.each_with_index do |line, index|
        stripped = line.strip

        if stripped.match?(FENCE)
          # Before the first marker a fence is part of the question. After it, a
          # fence is structural content and opens the aftermath — never a
          # continuation of the marker above it.
          break if first_marker_index

          in_fence = !in_fence
          prev_structural = false
          next
        end

        if in_fence
          prev_structural = false
          next
        end

        if stripped.empty?
          # A blank line does not end the run — options arrive blank-separated —
          # but it does end a wrapped value: the next line starts something new.
          prev_structural = false
          next
        end

        kind =
          if stripped.match?(/\A[A-Da-d]\)\s/) then :option
          elsif stripped.match?(/\A(?:CORRECTA|CORRECT|ANSWER):\s*/i) then :correct
          elsif stripped.match?(/\A(?:EXPLICACI[OÓ]N|EXPLANATION):\s*/i) then :explanation
          elsif stripped.match?(/\A\d+\)\s/) then :numbered
          end

        if kind.nil?
          # Still before the first marker: this is the question.
          next if first_marker_index.nil?
          # Directly under an option or an EXPLICACIÓN, this is that marker's
          # wrapped value. CORRECTA is a single letter and a numbered line is not
          # collected, so a line under either of those is not a continuation of
          # anything: the run is over and the aftermath starts here. (Consuming
          # it as a wrapped value with nowhere to put it deleted the line.)
          break unless prev_structural && %i[option explanation].include?(last_kind)
          break if aftermath_boundary?(stripped, %i[heading rule])

          case last_kind
          when :option      then options.last[:label] = "#{options.last[:label]} #{stripped}".strip
          when :explanation then explanation = "#{explanation} #{stripped}".strip
          end
          last_marker_index = index
          next
        end

        # THE RUN FOLLOWS THE TEMPLATE'S GRAMMAR: options, then one CORRECTA,
        # then one EXPLICACIÓN. A marker-shaped line the grammar no longer
        # expects is prose that happens to open like a marker — `Answer: think
        # about it before moving on.` after the explanation — and it ends the
        # run instead of joining it. Without this, a blank line followed by such
        # a line overwrote `correct_letter` with prose (no option correct, the
        # check unanswerable and non-gating) and moved the aftermath boundary
        # past everything above it; "contiguous" alone did not stop it, because
        # a blank line does not end the run and a marker-shaped line was always
        # accepted. The first CORRECTA and the first EXPLICACIÓN win; options
        # are accepted only until either has been seen.
        expected =
          case kind
          when :option, :numbered then correct_letter.nil? && explanation.nil?
          when :correct           then correct_letter.nil?
          when :explanation       then explanation.nil?
          end
        break unless expected

        case kind
        when :option
          options << { label: stripped.sub(/\A[A-Da-d]\)\s*/, ""), correct: false }
        when :correct
          correct_letter = stripped.sub(/\A(?:CORRECTA|CORRECT|ANSWER):\s*/i, "").strip.upcase
        when :explanation
          explanation = stripped.sub(/\A(?:EXPLICACI[OÓ]N|EXPLANATION):\s*/i, "").strip
        end

        last_kind = kind
        first_marker_index ||= index
        last_marker_index = index
        prev_structural = true
      end

      if first_marker_index.nil?
        # NO STRUCTURE AT ALL, so nothing to protect and no reason to treat this
        # body differently from any other accumulating block: the ordinary
        # terminator rule applies from the top. Folding the whole body into
        # `question` put a mermaid fence inside the modal, which is the one
        # place `_lesson.html.erb` says an aftermath must never render.
        body_question, aftermath = split_aftermath(lines.join)
      else
        body_question = lines[0...first_marker_index].join
        # Everything after the last marker, verbatim. No terminator hunt: the
        # boundary is already known, and hunting inside a tail that is trailing
        # content by construction only creates a second place to lose it.
        aftermath = lines[(last_marker_index + 1)..].join.strip.presence
      end

      question = [question_from_heading.presence, body_question.to_s.strip.presence].compact.join("\n\n")

      if correct_letter && correct_letter.match?(/\A[A-D]\z/)
        correct_index = correct_letter.ord - "A".ord
        options[correct_index][:correct] = true if options[correct_index]
      end

      {
        type: "check",
        title: nil,
        question: question,
        options: options,
        explanation: explanation,
        aftermath: aftermath,
        xp: 15
      }
    end

    # Parse ## Visual: heading format — extract image description for AI generation
    def parse_heading_visual(title_from_heading, body)
      # The body IS the image description (used as prompt for AI image generation)
      image_description = body.to_s.strip

      # Check if body contains a mermaid diagram
      has_diagram = body.to_s.include?("```mermaid")

      {
        type: "visual",
        title: title_from_heading.presence,
        alt_text: title_from_heading.to_s.strip,
        body: body,
        image_description: image_description.presence,
        image_url: nil,
        caption: nil,
        contains_diagram: has_diagram
      }
    end

    # `## Motion: <scene>` with a JSON body. The heading's title IS the scene
    # name, from the closed vocabulary the schema files define.
    #
    # Ruby owns `narration`; the scene's schema owns `data`. Anything the schema
    # refuses — a bad index, a missing key, an unknown scene, unparseable JSON —
    # becomes a CONCEPT carrying the narration text, and says why in the log, the
    # way a dropped ::: block does. A default may render less; it may never
    # render something false.
    def parse_heading_motion(scene_from_heading, body)
      scene = scene_from_heading.to_s.strip
      json_text, remainder = split_json_object(body)
      payload = safe_parse_json(json_text)
      narration = payload.is_a?(Hash) ? payload["narration"].to_s.strip : ""

      reason =
        # `payload.nil?` is deliberately redundant with `narration.blank?` for
        # every malformed input: narration is unconditionally "" whenever
        # payload isn't a Hash, so this branch never independently decides
        # the fallback and cannot be pinned by a test in isolation — see
        # section_parser_boundaries_test.rb's motion tests and the review
        # history for task 8. It earns its place anyway for the distinct
        # logged reason: "body is not JSON" describes a garbled generation,
        # "no narration" a well-formed-but-empty one, and that difference is
        # real diagnostic value even though no test can observe it. Do not
        # delete this on the grounds that no test covers it independently.
        if payload.nil?             then "body is not JSON"
        elsif narration.blank?      then "no narration"
        elsif !MotionScenes.known?(scene) then "unknown scene #{scene.inspect}"
        else
          errors = MotionScenes.validate(scene, payload["data"])
          errors.any? ? "invalid data: #{errors.join('; ')}" : nil
        end

      if reason
        Rails.logger.warn("[LessonSectionParser] motion block fell back to concept — #{reason}")
        # The whole body already becomes the concept's content, so there is no
        # separate aftermath to carry here — unlike the "motion" branch below,
        # a concept has nothing else that would render it.
        return { type: "concept", title: nil, body: narration.presence || body.to_s.strip }
      end

      { type: "motion", scene: scene, data: payload["data"], narration: narration,
        aftermath: strip_closing_fence(remainder).strip.presence, body: body.to_s.strip }
    end

    # A `## Motion:` body is a fenced-or-bare JSON object followed by whatever
    # trailing markdown the rest of this file's sweep exists to prove every
    # heading parser survives — a sub-heading, a diagram, prose. Rather than
    # require the whole remaining body to be valid JSON (it never is once
    # trailing content is present), find the first balanced top-level `{...}`
    # and treat everything after its matching `}` as the aftermath, the same
    # boundary every sibling heading parser in this file establishes.
    #
    # Returns [json_text, remainder] — `json_text` is nil when no balanced
    # object was found at all (malformed JSON), in which case `remainder` is
    # the whole body: there is no JSON boundary to split on, so nothing here
    # is "after" it.
    def split_json_object(body)
      text = body.to_s
      start = text.index("{")
      return [nil, text] unless start

      depth = 0
      in_string = false
      escaped = false

      (start...text.length).each do |i|
        char = text[i]

        if in_string
          if escaped
            escaped = false
          elsif char == "\\"
            escaped = true
          elsif char == '"'
            in_string = false
          end
          next
        end

        case char
        when '"' then in_string = true
        when "{" then depth += 1
        when "}"
          depth -= 1
          return [text[start..i], text[(i + 1)..].to_s] if depth.zero?
        end
      end

      [nil, text]
    end

    # The fenced form's closing ``` immediately follows the JSON object and is
    # not itself content — strip it before what remains becomes the aftermath.
    def strip_closing_fence(remainder)
      remainder.to_s.sub(/\A[ \t]*\n?```[ \t]*\n?/, "")
    end

    def safe_parse_json(text)
      return nil if text.nil?

      JSON.parse(text)
    rescue JSON::ParserError
      nil
    end

    # Parse ## Resumen: heading format with PUNTOS CLAVE: bullet list
    def parse_heading_summary(title_from_heading, body)
      full_text = body.to_s.strip
      # Remove "PUNTOS CLAVE:" or "KEY POINTS:" label if present
      full_text = full_text.sub(/\A(?:PUNTOS CLAVE|KEY POINTS):\s*/i, "")

      key_points = full_text.lines
                            .select { |l| l.strip.match?(/^[-*]\s/) }
                            .map { |l| l.strip.sub(/^[-*]\s+/, "") }

      remaining = full_text.lines
                           .reject { |l| l.strip.match?(/^[-*]\s/) || l.strip.match?(/\A(?:PUNTOS CLAVE|KEY POINTS):/i) }
                           .join.strip

      {
        type: "summary",
        title: title_from_heading.presence,
        key_points: key_points,
        body: remaining.presence
      }
    end

    # ── Where a block ends ───────────────────────────────────────────
    #
    # `split_by_headings` cuts the document on `^##\s`, so a body handed to a
    # `parse_heading_*` method never contains a `##` line. It routinely contains
    # `###` sub-headings, fenced code, horizontal rules and trailing prose — and a
    # parser that appends every unrecognised line to whatever it collected last
    # eats all of it. In production a scenario's last option revealed the word
    # "Consequence." followed by an entire mermaid `sequenceDiagram` fence,
    # flattened onto one line, so the diagram could never draw.
    #
    # These three patterns are the terminator. Everything from the first match to
    # the end of the body is the AFTERMATH: real lesson content the author placed
    # after the block. It is preserved on the section and rendered below the card
    # — it is not swallowed, and it does not become a new section, because
    # `block_attempts.section_index` indexes into the persisted array and a
    # changed section count silently re-points every recorded attempt.
    SUB_HEADING     = /\A\#{3,6}\s/
    FENCE           = /\A(?:```|~~~)/
    HORIZONTAL_RULE = /\A(?:-{3,}|\*{3,}|_{3,})\s*\z/

    # `:rule` is excluded for flashcards, where `---` is the card separator and
    # therefore part of the block's own grammar rather than the end of it.
    def split_aftermath(body, rules: %i[heading fence rule])
      lines = body.to_s.lines
      boundary = lines.index { |line| aftermath_boundary?(line.strip, rules) }
      return [body.to_s, nil] if boundary.nil?

      [lines[0...boundary].join, lines[boundary..].join.strip.presence]
    end

    def aftermath_boundary?(stripped, rules)
      return false if stripped.empty?

      (rules.include?(:heading) && stripped.match?(SUB_HEADING)) ||
        (rules.include?(:fence) && stripped.match?(FENCE)) ||
        (rules.include?(:rule) && stripped.match?(HORIZONTAL_RULE))
    end

    # Yields `[stripped_line, index]` for every line that is NOT inside a
    # fenced code block. The fence lines themselves are not yielded either.
    #
    # The structural scanners (`A)` options, CORRECTA, `==>` pairs) read line
    # shapes, and a fence can contain any shape: `==>` is mermaid's thick arrow,
    # and the sample output of a "what does this print?" question can start
    # with `A) `. What is inside a fence is content, never structure.
    def each_line_outside_fences(lines)
      in_fence = false
      lines.each_with_index do |line, index|
        stripped = line.strip
        if stripped.match?(FENCE)
          in_fence = !in_fence
          next
        end
        yield stripped, index unless in_fence
      end
    end

    # ── Interactive block parsers ────────────────────────────────────

    # ## Match: title / pairs separated by ==>
    #
    # Selecting the `==>` lines kept the trailing content out of `pairs`, which
    # is what the old boundaries "control" asserted — but it also threw that
    # content away. The prose before the first pair is the board's `intro`;
    # everything after the LAST pair is the aftermath, verbatim.
    #
    # Not `split_aftermath` here either — see `parse_heading_check`. The last
    # `==>` line IS the boundary, so looking for a second one only lost the
    # prose that sat before it.
    #
    # `==>` is also mermaid's thick arrow. A `## Match:` followed by a diagram
    # read the diagram's arrows as pairs and left an aftermath that began with
    # the dangling closing fence, so pairs are only recognised outside fences.
    def parse_heading_drag_drop(title, body)
      lines = body.to_s.lines

      # THE BOARD IS A CONTIGUOUS RUN, for the same reason a check's markers are.
      # `pair_indexes.last` is the aftermath boundary, and collecting `==>` from
      # the whole body made trailing prose that merely MENTIONS the arrow — "write
      # it as term ==> meaning", a natural thing for a Match block's own prose to
      # say — into a pair on the board AND moved the boundary past everything
      # above it, deleting the diagram. Same shape as `parse_heading_check`: once
      # the pairs have started, the first line that is not a pair ends them.
      # Blank lines do not, so a blank-separated board still parses.
      pair_indexes = []
      each_line_outside_fences(lines) do |stripped, i|
        if lines[i].include?("==>")
          pair_indexes << i
        elsif stripped.present? && pair_indexes.any?
          break
        end
      end

      pairs = pair_indexes.map do |i|
        parts = lines[i].strip.split("==>", 2)
        { term: parts[0].to_s.strip, definition: parts[1].to_s.strip }
      end

      intro = lines[0...(pair_indexes.first || lines.size)].join.strip.presence

      aftermath = nil
      if pair_indexes.any? && pair_indexes.last + 1 < lines.size
        aftermath = lines[(pair_indexes.last + 1)..].join.strip.presence
      end

      {
        type: "drag_drop", title: title.presence, intro: intro,
        pairs: pairs, aftermath: aftermath, body: body
      }
    end

    # ## Complete: title / sentence with BLANK--word--BLANK tokens
    def parse_heading_fill_blank(title, body)
      content, aftermath = split_aftermath(body.to_s.strip)
      text = content.strip
      blanks = text.scan(/BLANK--(.+?)--BLANK/).flatten
      sentence = text.gsub(/BLANK--(.+?)--BLANK/, "___")

      {
        type: "fill_blank", title: title.presence,
        sentence: sentence, blanks: blanks, aftermath: aftermath, body: body
      }
    end

    # ## Playground: title / code block with optional test outputs
    def parse_heading_code_playground(title, body)
      text = body.to_s.strip
      code_match = text.match(/```(\w+)\n(.*?)```/m)
      language = code_match ? code_match[1] : "python"
      code = code_match ? code_match[2].strip : text
      # Extract expected output after the code block
      # Split what follows the code, not the whole body: the block's OWN fence
      # would otherwise be read as its terminator.
      after_code = code_match ? text[code_match.end(0)..].to_s : ""
      expected_text, aftermath = split_aftermath(after_code)
      expected = expected_text.strip.presence

      {
        type: "code_playground", title: title.presence,
        language: language, code: code, expected_output: expected,
        aftermath: aftermath, body: body
      }
    end

    # ## Simulation: title / variables, formula, ranges
    def parse_heading_simulation(title, body)
      content, aftermath = split_aftermath(body.to_s.strip)
      variables = []
      formula = nil

      content.lines.each do |line|
        stripped = line.strip
        if stripped.match?(/\A\w+\s*[:=]/)
          name, rest = stripped.split(/[:=]/, 2)
          range_match = rest.to_s.match(/(\d+(?:\.\d+)?)\s*(?:to|-|\.\.)\s*(\d+(?:\.\d+)?)/)
          if range_match
            variables << { name: name.strip, min: range_match[1].to_f, max: range_match[2].to_f, default: ((range_match[1].to_f + range_match[2].to_f) / 2).round(1) }
          end
        elsif stripped.match?(/formula|equation|f\(/i) || stripped.include?("=")
          formula ||= stripped
        end
      end

      {
        type: "simulation", title: title.presence,
        variables: variables, formula: formula, aftermath: aftermath, body: body
      }
    end

    # ## Scenario: title / OPTION A, OPTION B, OPTION C with consequences
    def parse_heading_scenario(title, body)
      content, aftermath = split_aftermath(body.to_s.strip)
      situation = []
      options = []
      current_option = nil

      content.lines.each do |line|
        stripped = line.strip
        if stripped.match?(/\AOPTION\s+[A-Z][:.]?\s*/i)
          label = stripped.sub(/\AOPTION\s+[A-Z][:.]?\s*/i, "").strip
          current_option = { label: label, lines: [] }
          options << current_option
        elsif current_option
          # Blank lines are kept: a consequence is rendered as markdown, and
          # without them two paragraphs become one. Each line is stripped so
          # stray indentation cannot turn prose into a code block.
          current_option[:lines] << stripped
        else
          situation << stripped
        end
      end

      options = options.map do |option|
        { label: option[:label], consequence: option[:lines].join("\n").strip }
      end

      {
        type: "scenario", title: title.presence,
        situation: situation.join(" ").strip, options: options,
        aftermath: aftermath, body: body
      }
    end

    # ## Flashcards: title / FRONT/BACK pairs separated by ---
    def parse_heading_flashcards(title, body)
      # `:rule` excluded: `---` separates cards here, so it belongs to this
      # block's grammar rather than marking the end of it.
      content, aftermath = split_aftermath(body.to_s, rules: %i[heading fence])
      cards = []
      current_front = nil
      current_back = nil
      side = :front

      content.lines.each do |line|
        stripped = line.strip
        if stripped == "---"
          if current_front && current_back
            cards << { front: current_front.strip, back: current_back.strip }
          end
          current_front = nil
          current_back = nil
          side = :front
        elsif stripped.match?(/\AFRONT[:.]?\s*/i)
          current_front = stripped.sub(/\AFRONT[:.]?\s*/i, "")
          side = :front
        elsif stripped.match?(/\ABACK[:.]?\s*/i)
          current_back = stripped.sub(/\ABACK[:.]?\s*/i, "")
          side = :back
        elsif side == :front
          current_front = [current_front, stripped].compact.join(" ")
        else
          current_back = [current_back, stripped].compact.join(" ")
        end
      end

      # Don't forget the last card
      if current_front && current_back
        cards << { front: current_front.strip, back: current_back.strip }
      end

      {
        type: "flashcards", title: title.presence,
        cards: cards, aftermath: aftermath, body: body
      }
    end

    # `## Video: <title>` with a JSON body written by the studio's upload.
    # Mirrors parse_heading_visual in shape; mirrors WP-36's motion block in its
    # failure rule — anything unparsable degrades to a concept carrying the title,
    # never a blank player.
    #
    # `split_aftermath` trims a trailing sub-heading/fence/rule before the JSON
    # is parsed — the same boundary every other heading parser in this file
    # respects (see the SWEEP at the top of section_parser_boundaries_test.rb).
    # Without it, prose the author put after the studio's upload would land
    # inside the string handed to JSON.parse and a well-formed payload would
    # fail to parse for a reason that has nothing to do with the payload.
    def parse_heading_video(title_from_heading, body)
      json_source, aftermath = split_json_object(body.to_s)
      payload = safe_parse_json(json_source.to_s.strip)

      unless payload.is_a?(Hash) && payload["video_url"].present?
        Rails.logger.warn("[LessonSectionParser] video block fell back to concept — bad body")
        return { type: "concept", title: title_from_heading.presence, body: body.to_s.strip }
      end

      {
        type: "video",
        title: (payload["title"].presence || title_from_heading.presence),
        video_url: payload["video_url"],
        subtitles_url: payload["subtitles_url"].presence,
        duration_seconds: payload["duration_seconds"],
        source: payload["source"],
        lesson_id: payload["lesson_id"],
        voice: payload["voice"],
        published_at: payload["published_at"],
        # Kept, not only excluded from the payload. Dropping this second return
        # value is the `check` / `drag_drop` defect — the tail stays out of the
        # parsed fields either way, so the swallow half of the boundaries sweep
        # stays green while the author's prose is deleted. `_video.html.erb`
        # renders it below the player, like every other partial that can carry
        # one. Unreachable through the studio (it writes JSON only, and the
        # publisher terminates the section at the next `##`), so this is defence
        # in depth against the next writer of this heading, not a live loss.
        aftermath: aftermath,
        body: body.to_s.strip
      }
    end

    # The JSON object at the head of the body, and everything after it.
    #
    # `split_aftermath` CANNOT do this job, and using it here was a real defect: it cuts
    # at a sub-heading, a fence or a horizontal rule, and prose has none of those. 8 of
    # the 10 lesson bodies in the development database begin with a paragraph before
    # their first `##` heading — the parser has a whole branch for that shape — so
    # prepending a `## Video:` heading put that paragraph inside the video's section,
    # where it was handed to JSON.parse along with the payload. The block degraded to a
    # concept whose body was raw JSON, and the publisher raised rather than persist it,
    # which turned four out of five real lessons into a 422.
    #
    # The payload's own closing brace is the boundary, so that is what is scanned for:
    # depth counting, with strings and escapes respected, because `{"title": "Un {reto}
    # difícil"}` is one object and not two. Anything before the opening brace or after
    # the closing one is the aftermath, which is rendered below the player.
    #
    # Returns [nil, body] when there is no balanced object to find, which is how a
    # malformed payload still degrades to a concept.
    #
    # MERGE NOTE: WP-36 carries a helper of this name too, and that branch is not
    # merged. Whichever package lands second resolves the conflict by keeping ONE copy
    # and checking that both callers still pass — the same arrangement `safe_parse_json`
    # below already has. Compare the return contracts before deleting either: this one
    # answers [json, aftermath] and treats a missing object as [nil, whole body].
    # Public on the class as well: `LessonVideoPublisher` has to remove exactly the
    # payload this decides to read, and two different answers to "where does the JSON
    # end" is how the unpublish strip came to delete the author's prose.
    def self.split_json_object(body) = new("").send(:split_json_object, body)

    def split_json_object(body)
      text = body.to_s
      start = text.index("{")
      return [nil, text.strip.presence] if start.nil?

      depth = 0
      in_string = false
      escaped = false
      text[start..].each_char.with_index do |char, offset|
        if escaped
          escaped = false
          next
        end

        case char
        when "\\" then escaped = true if in_string
        when '"' then in_string = !in_string
        when "{" then depth += 1 unless in_string
        when "}"
          next if in_string

          depth -= 1
          next unless depth.zero?

          finish = start + offset
          return [text[start..finish], text[(finish + 1)..].to_s.strip.presence]
        end
      end

      [nil, text.strip.presence]
    end

    # Deliberately identical to WP-36's helper of the same name, so that whichever of
    # the two packages merges second resolves the conflict by deleting one copy.
    def safe_parse_json(text)
      return nil if text.nil?

      JSON.parse(text)
    rescue JSON::ParserError
      nil
    end

    def split_by_paragraphs(text)
      # Split by double newlines into paragraphs
      paragraphs = text.split(/\n{2,}/).map(&:strip).reject(&:empty?)
      return [build_concept_or_visual("Lección", text.strip)] if paragraphs.size <= PARAGRAPHS_PER_SECTION

      sections = []
      paragraphs.each_slice(PARAGRAPHS_PER_SECTION).with_index do |group, idx|
        body = group.join("\n\n")
        title = idx.zero? ? "Lección" : "Continuación"
        sections << build_concept_or_visual(title, body)
      end
      sections
    end

    # ── Section builders ──────────────────────────────────────────────

    def build_concept_or_visual(title, body)
      body = body.to_s.strip
      image_match = body.match(IMAGE_REGEX)
      has_diagram = body.include?("```mermaid")

      if image_match
        {
          type: "visual",
          title: title,
          body: body,
          image_url: image_match[2],
          contains_diagram: has_diagram
        }
      else
        section = { type: "concept", title: title, body: body }
        section[:contains_diagram] = true if has_diagram
        section
      end
    end

    def blank_concept_section
      { type: "concept", title: nil, body: "" }
    end

    def empty_summary_section
      { type: "summary", title: nil, key_points: [], body: nil }
    end

    # ── Injection helpers ─────────────────────────────────────────────

    def inject_metadata_checks(sections)
      knowledge_checks = @metadata["knowledge_checks"] || @metadata[:knowledge_checks]
      return sections unless knowledge_checks.is_a?(Array) && knowledge_checks.any?

      concept_count = sections.count { |s| s[:type] == "concept" || s[:type] == "visual" }
      check_count = sections.count { |s| s[:type] == "check" }

      # Only inject if fewer than 1 check per CONCEPTS_PER_CHECK concepts
      return sections if concept_count.zero? || check_count * CONCEPTS_PER_CHECK >= concept_count

      result = []
      concept_seen = 0
      check_index = 0

      sections.each do |section|
        result << section

        if section[:type] == "concept" || section[:type] == "visual"
          concept_seen += 1

          if concept_seen % CONCEPTS_PER_CHECK == 0 && check_index < knowledge_checks.size
            kc = knowledge_checks[check_index]
            check_index += 1

            options = (kc["options"] || kc[:options] || []).each_with_index.map do |opt, i|
              correct_idx = kc["correct_index"] || kc[:correct_index]
              { label: opt, correct: i == correct_idx }
            end

            result << {
              type: "check",
              title: nil,
              question: kc["question"] || kc[:question],
              options: options,
              explanation: kc["explanation"] || kc[:explanation]
            }
          end
        end
      end

      # Append any remaining checks at the end (before summary)
      while check_index < knowledge_checks.size
        kc = knowledge_checks[check_index]
        check_index += 1

        options = (kc["options"] || kc[:options] || []).each_with_index.map do |opt, i|
          correct_idx = kc["correct_index"] || kc[:correct_index]
          { label: opt, correct: i == correct_idx }
        end

        result << {
          type: "check",
          title: nil,
          question: kc["question"] || kc[:question],
          options: options,
          explanation: kc["explanation"] || kc[:explanation]
        }
      end

      result
    end

    def inject_audio_section(sections)
      return sections unless @audio_url.present?

      # Insert after the first concept/visual section
      insert_index = sections.index { |s| s[:type] == "concept" || s[:type] == "visual" }
      return sections unless insert_index

      audio = {
        type: "audio",
        title: nil,
        audio_url: @audio_url,
        transcript: nil
      }

      sections.insert(insert_index + 1, audio)
      sections
    end

    def ensure_summary(sections)
      return sections if sections.any? { |s| s[:type] == "summary" }

      key_points = sections
                     .select { |s| s[:type] == "concept" || s[:type] == "visual" }
                     .map { |s| s[:title] }
                     .reject { |t| t.blank? || t == "Lección" || t == "Continuación" || t == "Introducción" }

      sections << {
        type: "summary",
        title: nil,
        key_points: key_points,
        body: nil
      }

      sections
    end
  end
end
