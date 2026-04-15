# frozen_string_literal: true

module ContentEngine
  class LessonSectionParser
    BLOCK_TYPES = %w[concept check tip example summary drag_drop fill_blank code_playground simulation scenario flashcards].freeze
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
      return [blank_concept_section, auto_summary([])] if @body.blank?

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
          # Unknown block type — treat as freeform text
          segments << { block: false, text: match[0] }
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
        title: "Comprueba tu conocimiento",
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
      { type: "example", title: "Ejemplo", body: full_body.strip }
    end

    def parse_tip_block(title_line, body)
      full_body = title_line.present? ? "#{title_line}\n#{body}" : body
      { type: "tip", title: "Consejo", body: full_body.strip }
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
        title: "Resumen",
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
    HEADING_TYPE_MAP = {
      "Concepto"    => :concept,
      "Concept"     => :concept,
      "Ejemplo"     => :example,
      "Example"     => :example,
      "Visual"      => :visual,
      "Pregunta"    => :check,
      "Question"    => :check,
      "Resumen"     => :summary,
      "Summary"     => :summary,
      "Tip"         => :tip,
      "Consejo"     => :tip,
      "Match"       => :drag_drop,
      "Emparejar"   => :drag_drop,
      "Complete"    => :fill_blank,
      "Completa"    => :fill_blank,
      "Playground"  => :code_playground,
      "Simulation"  => :simulation,
      "Simulacion"  => :simulation,
      "Scenario"    => :scenario,
      "Escenario"   => :scenario,
      "Flashcards"  => :flashcards
    }.freeze

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
          when :example
            sections << { type: "example", title: title.presence || "Ejemplo", body: body }
          when :tip
            sections << { type: "tip", title: title.presence || "Consejo", body: body }
          when :summary
            sections << parse_heading_summary(title, body)
          when :concept
            sections << build_concept_or_visual(title.presence || "Concepto", body)
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
    def parse_heading_check(question_from_heading, body)
      lines = body.lines.map { |l| l.rstrip }
      question = question_from_heading.presence
      options = []
      correct_letter = nil
      explanation = nil

      lines.each do |line|
        stripped = line.strip
        if stripped.match?(/\A[A-D]\)\s/)
          label = stripped.sub(/\A[A-D]\)\s*/, "")
          options << { label: label, correct: false }
        elsif stripped.match?(/\A(?:CORRECTA|CORRECT|ANSWER):\s*/i)
          correct_letter = stripped.sub(/\A(?:CORRECTA|CORRECT|ANSWER):\s*/i, "").strip.upcase
        elsif stripped.match?(/\A(?:EXPLICACI[OÓ]N|EXPLANATION):\s*/i)
          explanation = stripped.sub(/\A(?:EXPLICACI[OÓ]N|EXPLANATION):\s*/i, "").strip
        elsif question.blank? && stripped.present? && options.empty?
          # If no question from heading, first non-empty line is the question
          question = stripped
        end
      end

      # Mark correct option
      if correct_letter && correct_letter.match?(/\A[A-D]\z/)
        correct_index = correct_letter.ord - "A".ord
        options[correct_index][:correct] = true if options[correct_index]
      end

      {
        type: "check",
        title: "Comprueba tu conocimiento",
        question: question || "",
        options: options,
        explanation: explanation,
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
        title: title_from_heading.presence || "Visual",
        alt_text: title_from_heading.to_s.strip,
        body: body,
        image_description: image_description.presence,
        image_url: nil,
        caption: nil,
        contains_diagram: has_diagram
      }
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
        title: title_from_heading.presence || "Resumen",
        key_points: key_points,
        body: remaining.presence
      }
    end

    # ── Interactive block parsers ────────────────────────────────────

    # ## Match: title / pairs separated by ==>
    def parse_heading_drag_drop(title, body)
      pairs = body.to_s.lines
                  .map(&:strip)
                  .reject(&:empty?)
                  .select { |l| l.include?("==>") }
                  .map { |l| parts = l.split("==>", 2); { term: parts[0].to_s.strip, definition: parts[1].to_s.strip } }

      { type: "drag_drop", title: title.presence || "Match", pairs: pairs, body: body }
    end

    # ## Complete: title / sentence with BLANK--word--BLANK tokens
    def parse_heading_fill_blank(title, body)
      text = body.to_s.strip
      blanks = text.scan(/BLANK--(.+?)--BLANK/).flatten
      sentence = text.gsub(/BLANK--(.+?)--BLANK/, "___")

      { type: "fill_blank", title: title.presence || "Complete", sentence: sentence, blanks: blanks, body: body }
    end

    # ## Playground: title / code block with optional test outputs
    def parse_heading_code_playground(title, body)
      text = body.to_s.strip
      code_match = text.match(/```(\w+)\n(.*?)```/m)
      language = code_match ? code_match[1] : "python"
      code = code_match ? code_match[2].strip : text
      # Extract expected output after the code block
      after_code = code_match ? text[code_match.end(0)..].to_s.strip : ""
      expected = after_code.present? ? after_code : nil

      { type: "code_playground", title: title.presence || "Playground", language: language, code: code, expected_output: expected, body: body }
    end

    # ## Simulation: title / variables, formula, ranges
    def parse_heading_simulation(title, body)
      text = body.to_s.strip
      variables = []
      formula = nil

      text.lines.each do |line|
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

      { type: "simulation", title: title.presence || "Simulation", variables: variables, formula: formula, body: body }
    end

    # ## Scenario: title / OPTION A, OPTION B, OPTION C with consequences
    def parse_heading_scenario(title, body)
      text = body.to_s.strip
      situation = []
      options = []
      current_option = nil

      text.lines.each do |line|
        stripped = line.strip
        if stripped.match?(/\AOPTION\s+[A-Z][:.]?\s*/i)
          label = stripped.sub(/\AOPTION\s+[A-Z][:.]?\s*/i, "").strip
          current_option = { label: label, consequence: "" }
          options << current_option
        elsif current_option
          current_option[:consequence] = [current_option[:consequence], stripped].reject(&:empty?).join(" ")
        else
          situation << stripped
        end
      end

      { type: "scenario", title: title.presence || "Scenario", situation: situation.join(" "), options: options, body: body }
    end

    # ## Flashcards: title / FRONT/BACK pairs separated by ---
    def parse_heading_flashcards(title, body)
      cards = []
      current_front = nil
      current_back = nil
      side = :front

      body.to_s.lines.each do |line|
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

      { type: "flashcards", title: title.presence || "Flashcards", cards: cards, body: body }
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
      { type: "concept", title: "Lección", body: "" }
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
              title: "Comprueba tu conocimiento",
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
          title: "Comprueba tu conocimiento",
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
        title: "Audio explicación",
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
        title: "Resumen",
        key_points: key_points,
        body: nil
      }

      sections
    end
  end
end
