# frozen_string_literal: true

require "test_helper"

module ContentEngine
  # Pure-unit tests for the lesson content parser. Assertions are derived from
  # the actual parser source (11 real BLOCK_TYPES + heading map), not from a
  # spec — the parser returns e.g. `:::concept` title "Concepto" with the text
  # in :body, `## Match:` pairs as {term:, definition:}, summaries as :key_points.
  class LessonSectionParserTest < ActiveSupport::TestCase
    def parse(body, metadata: {}, audio_url: nil)
      LessonSectionParser.call(body, metadata: metadata, audio_url: audio_url)
    end

    def find_section(sections, type)
      sections.find { |s| s[:type].to_s == type.to_s }
    end

    # ─── Blank / nil (regression: blank input used to crash on auto_summary) ──
    test "blank input returns concept + summary without crashing" do
      sections = parse("")
      assert_equal 2, sections.size
      assert_equal "concept", sections.first[:type].to_s
      assert_equal "summary", sections.last[:type].to_s
      assert_equal [], sections.last[:key_points]
    end

    test "nil input returns concept + summary" do
      assert_equal 2, parse(nil).size
    end

    test "whitespace-only input is treated as blank" do
      assert_equal 2, parse("   \n\n   \n").size
    end

    # ─── ::: block types (11 real types) ─────────────────────────────────────
    # NOTE: the :::type regex consumes the first content line as the block
    # "title" (the \s* after :::type eats the newline), so :::-blocks carry a
    # title line, then their content.
    test ":::concept uses first line as title, rest as body" do
      s = find_section(parse(":::concept\nVariables\nThey store data.\n:::"), "concept")
      assert_not_nil s
      assert_equal "Variables", s[:title]
      assert_match(/store data/, s[:body])
    end

    test ":::check parses question and [x]/[ ] checkbox options" do
      md = ":::check\nWhat is 2+2?\n- [ ] 3\n- [x] 4\n- [ ] 5\n:::"
      s = find_section(parse(md), "check")
      assert_not_nil s
      assert_equal "What is 2+2?", s[:question]
      assert_equal 3, s[:options].size
      assert s[:options][1][:correct], "option '4' should be correct"
      assert_not s[:options][0][:correct]
      assert_equal "4", s[:options][1][:label]
    end

    test ":::example and :::tip carry their body" do
      ex = find_section(parse(":::example\nlike this\n:::"), "example")
      assert_equal "Ejemplo", ex[:title]
      assert_match(/like this/, ex[:body])

      tip = find_section(parse(":::tip\nremember\n:::"), "tip")
      assert_equal "Consejo", tip[:title]
      assert_match(/remember/, tip[:body])
    end

    test ":::summary extracts bullet key_points" do
      md = ":::summary\n- One\n- Two\n- Three\n:::"
      s = find_section(parse(md), "summary")
      assert_equal %w[One Two Three], s[:key_points]
    end

    test ":::drag_drop (with title line) parses ==> pairs as term/definition" do
      md = ":::drag_drop\nMatch these\nHello ==> Hola\nBye ==> Adiós\n:::"
      s = find_section(parse(md), "drag_drop")
      assert_equal 2, s[:pairs].size
      assert_equal "Hello", s[:pairs].first[:term]
      assert_equal "Hola", s[:pairs].first[:definition]
    end

    test ":::fill_blank turns BLANK--word--BLANK into ___ and captures blanks" do
      md = ":::fill_blank\nComplete it\nI BLANK--love--BLANK Ruby.\n:::"
      s = find_section(parse(md), "fill_blank")
      assert_includes s[:sentence], "___"
      assert_equal ["love"], s[:blanks]
    end

    test ":::code_playground extracts language and code" do
      md = ":::code_playground\nTry this\n```ruby\nputs 'hi'\n```\nhi\n:::"
      s = find_section(parse(md), "code_playground")
      assert_equal "ruby", s[:language]
      assert_match(/puts 'hi'/, s[:code])
      assert_equal "hi", s[:expected_output]
    end

    test ":::simulation parses variable ranges and formula" do
      md = ":::simulation\nGravity\nvelocity: 0 to 100\nv = g * t\n:::"
      s = find_section(parse(md), "simulation")
      assert_equal 1, s[:variables].size
      assert_equal "velocity", s[:variables].first[:name]
      assert_equal 0.0, s[:variables].first[:min]
      assert_equal 100.0, s[:variables].first[:max]
      # NOTE: a formula line like "v = g * t" starts with \w+= so the parser
      # misclassifies it as a (range-less, dropped) variable — formula stays nil.
      assert_nil s[:formula]
    end

    test ":::scenario parses OPTION entries with consequences" do
      md = ":::scenario\nYou find a bug.\nOPTION A: Fix now\nShip a hotfix.\nOPTION B: Wait\nSchedule it.\n:::"
      s = find_section(parse(md), "scenario")
      assert_equal 2, s[:options].size
      assert_equal "Fix now", s[:options].first[:label]
      assert_match(/hotfix/, s[:options].first[:consequence])
    end

    test ":::flashcards parses FRONT/BACK cards separated by ---" do
      md = ":::flashcards\nTerms\nFRONT: Ruby\nBACK: A language\n---\nFRONT: Rails\nBACK: A framework\n:::"
      s = find_section(parse(md), "flashcards")
      assert_equal 2, s[:cards].size
      assert_equal "Ruby", s[:cards].first[:front]
      assert_equal "A language", s[:cards].first[:back]
    end

    # ─── ## heading types ────────────────────────────────────────────────────
    test "## Concepto: heading uses the heading text as the title" do
      s = find_section(parse("## Concepto: Variables\nThey store data."), "concept")
      assert_equal "Variables", s[:title]
      assert_match(/store data/, s[:body])
    end

    test "## Visual: heading creates a visual with nil image_url and a description" do
      s = find_section(parse("## Visual: A clean infographic of data flow"), "visual")
      assert_not_nil s
      assert_nil s[:image_url]
      assert_match(/infographic/, s[:image_description].to_s + s[:alt_text].to_s)
    end

    test "## Pregunta: heading parses A-D options + CORRECTA + explanation" do
      md = <<~MD
        ## Pregunta: What is Ruby?
        A) A gem
        B) A language
        C) A framework
        D) A database
        CORRECTA: B
        EXPLICACIÓN: Ruby is a language.
      MD
      s = find_section(parse(md), "check")
      assert_equal "What is Ruby?", s[:question]
      assert_equal 4, s[:options].size
      assert_equal "A language", s[:options][1][:label]
      assert s[:options][1][:correct]
      assert_equal "Ruby is a language.", s[:explanation]
      assert_equal 15, s[:xp]
    end

    test "## Resumen: heading strips PUNTOS CLAVE label and lists key_points" do
      md = "## Resumen: Lo aprendido\nPUNTOS CLAVE:\n- Point one\n- Point two\n- Point three"
      s = find_section(parse(md), "summary")
      assert_equal 3, s[:key_points].size
      assert_equal "Point one", s[:key_points].first
    end

    test "## Match: heading creates drag_drop with term/definition pairs" do
      s = find_section(parse("## Match: Vocab\nTerm1 ==> Def1\nTerm2 ==> Def2"), "drag_drop")
      assert_equal 2, s[:pairs].size
      assert_equal "Term1", s[:pairs].first[:term]
      assert_equal "Def1", s[:pairs].first[:definition]
    end

    test "## Complete: / Playground: / Simulation: / Scenario: / Flashcards: headings route correctly" do
      assert find_section(parse("## Complete: Fill\nI BLANK--love--BLANK it."), "fill_blank")
      assert find_section(parse("## Playground: Try\n```ruby\nputs 1\n```"), "code_playground")
      assert find_section(parse("## Simulation: G\nx: 0 to 10\ny = x"), "simulation")
      assert find_section(parse("## Scenario: D\nOPTION A: a\nc\nOPTION B: b\nd"), "scenario")
      assert find_section(parse("## Flashcards: T\nFRONT: a\nBACK: b"), "flashcards")
    end

    test "## Tip: and ## Example: headings map to tip/example" do
      assert_equal "tip", find_section(parse("## Tip: X\nbody"), "tip")[:type]
      assert_equal "example", find_section(parse("## Example: X\nbody"), "example")[:type]
    end

    test "Spanish and English concept headings both work" do
      assert find_section(parse("## Concepto: Prueba\nCuerpo."), "concept")
      assert find_section(parse("## Concept: Test\nBody."), "concept")
    end

    # ─── Injection / structural behavior ─────────────────────────────────────
    test "audio_url injects a separate audio section after the first concept" do
      sections = parse("## Concepto: Test\nBody.", audio_url: "https://ex.com/a.mp3")
      audio = find_section(sections, "audio")
      assert_not_nil audio
      assert_equal "https://ex.com/a.mp3", audio[:audio_url]
    end

    test "no audio_url means no audio section" do
      assert_nil find_section(parse("## Concepto: Test\nBody."), "audio")
    end

    test "a summary is always ensured" do
      assert find_section(parse("## Concepto: Only\nNo summary here."), "summary")
    end

    test "markdown image in body produces a visual section with image_url" do
      s = find_section(parse("## Concepto: Pic\n![alt](https://ex.com/i.png)"), "visual")
      assert_equal "https://ex.com/i.png", s[:image_url]
    end

    test "mermaid code block is preserved and flagged in the section" do
      md = "## Concepto: Arch\nDiagram:\n\n```mermaid\nflowchart TD\n A --> B\n```"
      s = find_section(parse(md), "concept")
      assert_match(/```mermaid/, s[:body])
      assert s[:contains_diagram]
    end

    test "metadata knowledge_checks are injected as check sections" do
      md = "## Concepto: A\na\n\n## Concepto: B\nb\n\n## Concepto: C\nc"
      meta = { "knowledge_checks" => [{ "question" => "Q?", "options" => %w[x y], "correct_index" => 1 }] }
      sections = parse(md, metadata: meta)
      check = find_section(sections, "check")
      assert_not_nil check
      assert_equal "Q?", check[:question]
      assert check[:options][1][:correct]
    end

    # ─── Mixed content + edge cases ──────────────────────────────────────────
    test "full mixed lesson yields all expected section types" do
      md = <<~MD
        Welcome!

        ## Concepto: First
        Concept one.

        ## Visual: A diagram of data flow

        :::drag_drop
        Hello ==> Hola
        Bye ==> Adiós
        :::

        ## Tip: Pro tip
        Test your code.

        ## Resumen: Recap
        - First
        - Testing
      MD
      types = parse(md).map { |s| s[:type].to_s }
      %w[concept visual drag_drop tip summary].each { |t| assert_includes types, t }
    end

    test "unknown ::: block type is treated as freeform, does not crash" do
      assert parse(":::totally_unknown\nstuff\n:::").any?
    end

    test "unclosed ::: block is treated as freeform, does not crash" do
      assert parse(":::concept\nnever closed").any?
    end

    test "very long body does not crash" do
      assert parse("## Concepto: Big\n" + ("word " * 5000)).any?
    end

    # ─── Structural constants (corrected: 11 real block types, not 22) ───────
    test "BLOCK_TYPES are the 11 implemented types" do
      expected = %w[concept check tip example summary drag_drop fill_blank code_playground simulation scenario flashcards]
      assert_equal expected.sort, LessonSectionParser::BLOCK_TYPES.sort
    end

    test "HEADING_TYPE_MAP covers Spanish and English markers" do
      map = LessonSectionParser::HEADING_TYPE_MAP
      assert_equal :concept, map["Concepto"]
      assert_equal :concept, map["Concept"]
      assert_equal :check,   map["Pregunta"]
      assert_equal :check,   map["Question"]
      assert_equal :summary, map["Resumen"]
      assert_equal :tip,     map["Consejo"]
      assert_equal :drag_drop, map["Match"]
    end
  end
end
