# frozen_string_literal: true

require "test_helper"

module ContentEngine
  # THE CLASS: a heading parser accumulates without a terminator and swallows the
  # rest of the section.
  #
  # `split_by_headings` cuts the document on `^##\s`, so the body a
  # `parse_heading_*` method receives never contains a `##` line. It does contain
  # `###` sub-headings, fenced code blocks, horizontal rules and trailing prose —
  # and a parser that appends every unrecognised line to "whatever it was
  # collecting last" eats all of it.
  #
  # Observed in production on a real lesson: option B of a scenario revealed the
  # word "Consequence." followed by an entire mermaid `sequenceDiagram` fence and
  # its Spanish explanation, flattened onto one line with `**bold**` markers
  # printed literally. The diagram could never have drawn.
  #
  # So this is a SWEEP, not a scenario test. Every accumulating parser gets the
  # same trailing content appended and must not absorb it.
  class SectionParserBoundariesTest < ActiveSupport::TestCase
    # Appended to every canonical block below, in this order: a sub-heading, a
    # fenced mermaid block, a horizontal rule, and two lines of prose.
    TRAILING = <<~MARKDOWN
      ### What actually happened

      ```mermaid
      sequenceDiagram
          Alice->>John: Hello John
      ```

      ---

      First trailing prose line.
      Second trailing prose line.
    MARKDOWN

    # Every one of these must be absent from the parsed fields, and present in the
    # aftermath of the blocks that gain one.
    TRAILING_MARKERS = [
      "What actually happened",
      "sequenceDiagram",
      "Alice->>John",
      "First trailing prose line",
      "Second trailing prose line"
    ].freeze

    # The accumulating parsers. Each entry is [heading, canonical body].
    ACCUMULATORS = {
      "scenario" => [
        "## Scenario: Choosing a launch strategy",
        <<~MARKDOWN
          The team must decide how to launch.
          OPTION A: Launch now
          You ship early and learn from real users.
          OPTION B: Wait a week
          You ship late, but polished.
        MARKDOWN
      ],
      "flashcards" => [
        "## Flashcards: Core vocabulary",
        <<~MARKDOWN
          FRONT: What is a variable?
          BACK: A named place to keep a value.
          ---
          FRONT: What is a function?
          BACK: A reusable piece of behaviour.
        MARKDOWN
      ],
      "code_playground" => [
        "## Playground: Adding two numbers",
        <<~MARKDOWN
          ```python
          print(2 + 2)
          ```

          Expected output: 4
        MARKDOWN
      ],
      "fill_blank" => [
        "## Complete: The capital city",
        "The capital of France is BLANK--Paris--BLANK.\n"
      ],
      "simulation" => [
        "## Simulation: Kinetic energy",
        <<~MARKDOWN
          mass: 1 to 10
          velocity: 0 to 100
          formula: energy = 0.5 * mass * velocity
        MARKDOWN
      ],
      # `check` was not in this sweep at all, and `drag_drop` was its CONTROL —
      # "selecting is already a terminator". Both were wrong in the same way:
      # neither accumulates the trailing content, but neither KEEPS it either.
      # A `## Pregunta` discards every line that is not an option, CORRECTA or
      # EXPLICACIÓN; a `## Match` discards every line without `==>`. The section
      # count never changes, so the count assertion below stayed green while the
      # generator's own mandatory mermaid diagram was being deleted.
      "check" => [
        "## Pregunta: Which one runs first?",
        <<~MARKDOWN
          A) The first one
          B) The second one
          C) Neither
          D) Both
          CORRECTA: A
          EXPLICACIÓN: The first statement runs first.
        MARKDOWN
      ],
      "drag_drop" => [
        "## Match: Spanish animals",
        "Dog ==> Perro\nCat ==> Gato\n"
      ]
    }.freeze

    ACCUMULATORS.each_key do |type|
      define_method(:"test_#{type}_does_not_swallow_the_rest_of_the_section") do
        section = parse_one(type)

        TRAILING_MARKERS.each do |marker|
          parsed_fields(section).each do |field, value|
            assert_not_includes value.to_s, marker,
              "#{type} swallowed #{marker.inspect} into #{field.inspect}: " \
              "the parser has no terminator, so everything after the last marker " \
              "line is absorbed by whatever it was collecting"
          end
        end
      end

      define_method(:"test_#{type}_keeps_the_trailing_content_as_aftermath") do
        section = parse_one(type)
        aftermath = section[:aftermath].to_s

        TRAILING_MARKERS.each do |marker|
          assert_includes aftermath, marker,
            "#{type} dropped #{marker.inspect}. The trailing content is real lesson " \
            "material the author placed after the block; it must be preserved, not deleted"
        end

        assert_equal TRAILING_MARKERS, TRAILING_MARKERS.sort_by { |m| aftermath.index(m) },
          "the aftermath must keep the author's order"
        assert_includes aftermath, "```mermaid",
          "the fence must survive intact or the diagram cannot render"
        assert aftermath.lines.size > 1,
          "the aftermath must keep its newlines; flattening it is what stopped the " \
          "diagram drawing in the first place"
      end
    end

    # Selecting keeps the trailing content OUT of `pairs`, which is what the old
    # control asserted — but it also threw it away. Both halves now.
    test "drag_drop keeps its pairs clean AND keeps the prose above the board" do
      section = parse_one("drag_drop")

      assert_equal 2, section[:pairs].size
      TRAILING_MARKERS.each { |marker| assert_not_includes section[:pairs].to_s, marker }
    end

    # THE CASE THE TEMPLATE ACTUALLY PRODUCES. `lesson_content.yml:127-128` tells
    # the model to put its first mandatory mermaid diagram immediately after the
    # CYCLE 2 interactive block, whose preferred types are `## Complete` and
    # `## Pregunta`. Half the time it lands in the body of a check.
    test "a check keeps the mermaid diagram the template puts after it" do
      body = <<~MARKDOWN
        A) The first one
        B) The second one
        C) Neither
        D) Both
        CORRECTA: A
        EXPLICACIÓN: The first statement runs first.

        ```mermaid
        flowchart TD
          A[Start] --> B[Finish]
        ```
      MARKDOWN
      section = parse_one_of("## Pregunta: Which one runs first?", body, "check")

      assert_equal 4, section[:options].size, "the options must be untouched"
      assert_includes section[:aftermath].to_s, "```mermaid",
        "the diagram the generator is told to emit was deleted by the check parser"
      assert_includes section[:aftermath].to_s, "flowchart TD"
      assert_operator section[:aftermath].to_s.lines.size, :>, 1,
        "the fence must keep its newlines or the diagram cannot render"
    end

    # THE OTHER HALF, and the reason the terminator cannot simply be "the first
    # fence": a programming question is a fence FOLLOWED by its options. A fence
    # before the first option is part of the question, not an aftermath.
    test "a fence before the first option belongs to the question" do
      body = <<~MARKDOWN
        ```python
        print(2 + 2)
        ```
        A) 4
        B) 22
        C) An error
        D) Nothing
        CORRECTA: A
      MARKDOWN
      sections = LessonSectionParser.call("## Pregunta: What does this print?\n\n#{body}")
      section = sections.find { |s| s[:type] == "check" }

      assert_includes section[:question].to_s, "print(2 + 2)",
        "the code the question is ABOUT was treated as trailing content"
      assert_includes section[:question].to_s, "```python"
      assert_equal 4, section[:options].size
      assert_nil section[:aftermath].presence,
        "there is nothing after the last marker line, so there is no aftermath"
    end

    # ── After the last marker, EVERYTHING is aftermath ──────────────────────
    #
    # The first version of this fix read `split_aftermath` at both sites and
    # threw its first return value away:
    #
    #   _kept, aftermath = split_aftermath(lines[(last_marker_index + 1)..].join)
    #
    # `split_aftermath` exists for a parser that does NOT know where its
    # accumulation ends — it hunts for a heading, a fence or a rule. These two
    # parsers already know: the last option / CORRECTA / EXPLICACIÓN line, and
    # the last `==>` line. Everything after that is trailing content BY
    # CONSTRUCTION, so hunting for a terminator inside it only creates a second
    # place for content to fall out of — `_kept`, discarded.
    #
    # The sweep above could not see it, because TRAILING opens with a `###`:
    # the terminator is on line one, `_kept` is always empty, and the two cases
    # below never happened in a test.
    test "a check keeps plain prose sitting between its last marker and the fence" do
      body = <<~MARKDOWN
        A) The first one
        B) The second one
        CORRECTA: A
        EXPLICACIÓN: The first statement runs first.

        Look carefully at the diagram below before you go on.

        ### What actually happened
      MARKDOWN
      section = parse_one_of("## Pregunta: Which one runs first?", body, "check")

      assert_includes section[:aftermath].to_s, "Look carefully at the diagram below",
        "the prose between EXPLICACION and the first terminator was discarded: " \
        "split_aftermath returned it as `_kept` and the caller threw it away"
      assert_includes section[:aftermath].to_s, "### What actually happened",
        "the terminated half must still be there too"
    end

    test "a check keeps trailing prose when there is no terminator at all" do
      body = <<~MARKDOWN
        A) Lima
        B) Quito
        CORRECTA: A
        EXPLICACION: Lima is the capital of Peru.

        Remember this, we use it in the next block.
        It comes back in the summary.
      MARKDOWN
      section = parse_one_of("## Pregunta: What is the capital?", body, "check")

      assert_includes section[:aftermath].to_s, "Remember this, we use it in the next block.",
        "with no heading, fence or rule after the markers there is no terminator, " \
        "so split_aftermath returned the whole tail as `_kept` and it was deleted"
      assert_includes section[:aftermath].to_s, "It comes back in the summary."
      assert_operator section[:aftermath].to_s.lines.size, :>, 1,
        "the trailing prose must keep its newlines"
    end

    test "a check does not leak its trailing prose into the answerable fields" do
      body = <<~MARKDOWN
        A) Lima
        B) Quito
        CORRECTA: A
        EXPLICACION: Lima is the capital of Peru.

        Remember this, we use it in the next block.
      MARKDOWN
      section = parse_one_of("## Pregunta: What is the capital?", body, "check")

      assert_equal 2, section[:options].size
      assert_equal "Lima is the capital of Peru.", section[:explanation]
      assert_not_includes section[:question].to_s, "Remember this"
      assert_not_includes section[:options].to_s, "Remember this"
    end

    test "a match keeps plain prose sitting between its last pair and the fence" do
      body = <<~MARKDOWN
        Dog ==> Perro
        Cat ==> Gato

        Say each word out loud when you match it.

        ### Why this works
      MARKDOWN
      section = parse_one_of("## Match: Spanish animals", body, "drag_drop")

      assert_equal 2, section[:pairs].size, "the board must be untouched"
      assert_includes section[:aftermath].to_s, "Say each word out loud when you match it.",
        "the prose between the last pair and the first terminator was discarded"
      assert_includes section[:aftermath].to_s, "### Why this works"
    end

    test "a match keeps trailing prose when there is no terminator at all" do
      body = <<~MARKDOWN
        Dog ==> Perro
        Cat ==> Gato

        Say each word out loud when you match it.
      MARKDOWN
      section = parse_one_of("## Match: Spanish animals", body, "drag_drop")

      assert_equal 2, section[:pairs].size
      assert_includes section[:aftermath].to_s, "Say each word out loud when you match it.",
        "with no terminator after the last pair, the whole tail was deleted"
    end

    # ── An option-less check is not a licence to swallow the section ─────────
    #
    # With no `A)`-`D)` line there is no `first_option_index`, and the whole body
    # became the `question`. `_check.html.erb` now renders `question` through
    # MarkdownRenderer, so a mermaid fence after an option-less `## Pregunta`
    # drew INSIDE THE MODAL — the one place `_lesson.html.erb` says an aftermath
    # must never be. With nothing structural to protect, the ordinary terminator
    # rule is the right one.
    test "an option-less check puts the fence in the aftermath, not in the question" do
      body = <<~MARKDOWN
        Think about it for a moment before you go on.

        ```mermaid
        graph TD
          A[Start] --> B[Finish]
        ```
      MARKDOWN
      section = parse_one_of("## Pregunta: What do you observe?", body, "check")

      assert_empty section[:options], "this check has no options; that is the case under test"
      assert_includes section[:question].to_s, "Think about it for a moment",
        "the prose before the terminator is still the question"
      assert_not_includes section[:question].to_s, "```mermaid",
        "the fence was folded into the question and now draws inside the modal"
      assert_includes section[:aftermath].to_s, "```mermaid",
        "the fence belongs in the aftermath, which renders in the lesson flow"
      assert_includes section[:aftermath].to_s, "graph TD"
    end

    # ── The question ends at the FIRST structural line, whatever kind ─────────
    #
    # `1) 4 / 2) 22 / CORRECTA: A` has no `A)`-`D)` line, so the option-less
    # branch ran and the body up to the first terminator — `CORRECTA: A`
    # included — became the `question`. `_check.html.erb` renders `question`
    # now, so the modal showed the student the answer key. A regression of the
    # first review round: before it, every unrecognised line was discarded and
    # the leak was invisible for the wrong reason.
    test "a check with numbered options does not leak CORRECTA into the question" do
      body = <<~MARKDOWN
        1) 4
        2) 22
        CORRECTA: A
        EXPLICACION: Two plus two.

        Now look at the diagram.
      MARKDOWN
      section = parse_one_of("## Pregunta: What does 2 + 2 print?", body, "check")

      assert_equal "What does 2 + 2 print?", section[:question].to_s.strip,
        "the answer key reached the question: the modal shows the student CORRECTA"
      assert_not_includes section[:question].to_s, "CORRECTA"
      assert_not_includes section[:question].to_s, "EXPLICACION"
      assert_equal "Two plus two.", section[:explanation]
      assert_includes section[:aftermath].to_s, "Now look at the diagram.",
        "after the last marker everything is still aftermath"
    end

    test "a check whose only structure is an explanation keeps the answer out of the question" do
      body = <<~MARKDOWN
        Think about it.
        EXPLICACION: The answer is the second one.
      MARKDOWN
      section = parse_one_of("## Pregunta: Which one?", body, "check")

      assert_not_includes section[:question].to_s, "EXPLICACION"
      assert_not_includes section[:question].to_s, "second one"
      assert_equal "The answer is the second one.", section[:explanation]
    end

    # ── `==>` inside a fence is mermaid's thick arrow, not a pair ─────────────
    #
    # A `## Match:` followed by a diagram read the arrows of the diagram as
    # pairs (pre-existing), and — once the aftermath started after the "last
    # pair" — an aftermath consisting of the dangling closing fence. The scanner
    # has to know when it is inside a fenced block, and so does the check's.
    test "a match does not read a mermaid arrow inside a fence as a pair" do
      body = <<~MARKDOWN
        Dog ==> Perro
        Cat ==> Gato

        ```mermaid
        graph LR
          A[Dog] ==> B[Perro]
          C[Cat] ==> D[Gato]
        ```

        That is the whole idea.
      MARKDOWN
      section = parse_one_of("## Match: Spanish animals", body, "drag_drop")

      assert_equal 2, section[:pairs].size,
        "the arrows inside the mermaid fence were read as pairs"
      assert_equal %w[Dog Cat], section[:pairs].map { |p| p[:term] }
      assert_includes section[:aftermath].to_s, "```mermaid",
        "the fence must reach the aftermath whole, not as a dangling ```"
      assert_includes section[:aftermath].to_s, "A[Dog] ==> B[Perro]"
      assert_includes section[:aftermath].to_s, "That is the whole idea."
      # `document` appends TRAILING, which carries one more fence: two fences,
      # four markers. An odd count means a fence was cut in half.
      assert_equal 4, section[:aftermath].to_s.scan("```").size,
        "an odd number of fence markers means the fence was cut"
    end

    test "a check does not read an option-shaped line inside its question fence as an option" do
      body = <<~MARKDOWN
        ```text
        A) this is sample output, not an option
        B) neither is this
        ```
        A) One
        B) Two
        CORRECTA: B
      MARKDOWN
      section = parse_one_of("## Pregunta: Which line is printed?", body, "check")

      assert_equal %w[One Two], section[:options].map { |o| o[:label] },
        "lines inside the question's fence were read as options"
      assert_includes section[:question].to_s, "sample output, not an option",
        "the fence is the question and must stay whole"
      assert section[:options][1][:correct], "CORRECTA: B must still resolve to the real second option"
    end

    # ── The marker run is CONTIGUOUS, and a wrapped value belongs to its marker ──
    #
    # Two defects the second round's patch left open, both from one cause: the
    # marker scan runs over the WHOLE body, including the trailing content this
    # parser exists to preserve.
    #
    # `last_marker_index` therefore answers "the last line anywhere that looked
    # structural", not "the end of the structure", and everything between the
    # real last marker and that line is deleted as if it were inside the block.
    test "a check keeps its aftermath when trailing prose opens like a marker" do
      body = <<~MARKDOWN
        A) Yes
        B) No
        CORRECTA: A
        EXPLICACIÓN: Because yes.

        Here is the diagram you need:

        ```mermaid
        graph TD
          A --> B
        ```

        Answer: think about it before moving on.
      MARKDOWN
      section = parse_one_of("## Pregunta: Does it?", body, "check")

      assert section[:options].any? { |o| o[:correct] },
        "the trailing `Answer:` line overwrote CORRECTA, so no option is correct " \
        "and BlockGrader turns the check into an unanswerable, non-gating block"
      assert_equal "Yes", section[:options].find { |o| o[:correct] }[:label]
      assert_includes section[:aftermath].to_s, "graph TD",
        "the diagram was deleted: the trailing line moved the aftermath boundary " \
        "past it, which is the exact loss this parser exists to close"
      assert_includes section[:aftermath].to_s, "Answer: think about it before moving on."
    end

    test "a check keeps a wrapped EXPLICACION in the explanation, not in the lesson" do
      body = <<~MARKDOWN
        A) Lima
        B) Quito
        CORRECTA: A
        EXPLICACIÓN: Lima is the capital of Peru, and it was
        founded in 1535 by Francisco Pizarro.
      MARKDOWN
      section = parse_one_of("## Pregunta: What is the capital?", body, "check")

      assert_includes section[:explanation].to_s, "founded in 1535",
        "only the first line of a wrapped EXPLICACION was captured"
      # `_aftermath.html.erb` renders ALWAYS and ungated, under the check, so the
      # tail of the explanation printed in the lesson before the student answered.
      assert_not_includes section[:aftermath].to_s, "founded in 1535",
        "the rest of the explanation leaked into the ungated aftermath: the " \
        "student reads the answer before opening the modal"
    end

    # Guard rails for the contiguity rule, so it cannot be "simplified" into
    # "the marker run ends at the first blank line".
    test "a check still collects options separated by blank lines" do
      body = <<~MARKDOWN
        A) Uno

        B) Dos

        CORRECTA: B
      MARKDOWN
      section = parse_one_of("## Pregunta: Cuál?", body, "check")

      assert_equal %w[Uno Dos], section[:options].map { |o| o[:label] },
        "a blank line between options must not end the marker run"
      assert section[:options][1][:correct]
    end

    test "a fence directly after the last marker starts the aftermath, not a continuation" do
      body = <<~MARKDOWN
        A) Uno
        B) Dos
        CORRECTA: A
        ```mermaid
        graph TD
          A --> B
        ```
      MARKDOWN
      section = parse_one_of("## Pregunta: Cuál?", body, "check")

      assert_equal "A", section[:options].find { |o| o[:correct] } && "A"
      assert_includes section[:aftermath].to_s, "graph TD",
        "a fence is structural: it ends the marker run instead of being swallowed " \
        "as a continuation of CORRECTA"
      assert_not_includes section[:explanation].to_s, "graph TD"
    end

    # The prose blocks are NOT part of this class and must not be "fixed".
    # Their whole body IS their content — it is handed to MarkdownRenderer and
    # displayed. Trailing prose after a concept legitimately belongs to that
    # concept, and giving them an aftermath would move content out of the block
    # that is supposed to show it.
    test "prose blocks deliberately keep the trailing content in their body" do
      %w[Concepto Ejemplo Consejo].each do |marker|
        sections = LessonSectionParser.call("## #{marker}: A title\n\nSome prose.\n\n#{TRAILING}")
        body = sections.first[:body].to_s

        assert_includes body, "What actually happened",
          "#{marker} must keep its trailing content: the whole body is what gets rendered"
      end
    end

    # Rule 3 of the brief: `block_attempts.section_index` indexes into the
    # persisted array, so a fix that changes the number of sections silently
    # re-points every recorded attempt at a different block.
    test "the fix does not change how many sections a document produces" do
      ACCUMULATORS.each do |type, (heading, canonical)|
        sections = LessonSectionParser.call(document(heading, canonical))

        assert_equal 2, sections.size,
          "#{type}: expected the block plus the auto-appended summary. Changing the " \
          "section count re-points every recorded block_attempt at a different block"
        assert_equal type, sections.first[:type]
      end
    end

    # The consequence reaches the student through MarkdownRenderer now, so what
    # the parser hands over has to survive the trip: its newlines (a flattened
    # consequence is why the diagram never drew) and its punctuation (the old
    # partial shipped it through an HTML attribute, which turned every double
    # quote into a literal `&quot;` on screen).
    test "a consequence keeps its newlines, its emphasis and its double quotes" do
      body = <<~MARKDOWN
        A customer complains.
        OPTION A: Apologise
        She says **"thank you"** and stays.

        You keep the account.
      MARKDOWN

      section = parse_one_of("## Scenario: A complaint", body, "scenario")
      consequence = section[:options].first[:consequence]

      assert_includes consequence, '"thank you"', "the quotes must survive the parser"
      assert_not_includes consequence, "&quot;", "nothing should be HTML-escaping this yet"
      assert_includes consequence, "**", "emphasis markers must reach the renderer intact"
      assert_equal 3, consequence.lines.size,
        "the blank line between the two paragraphs must survive, or markdown joins them"

      html = MarkdownRenderer.render(consequence).to_s
      assert_includes html, "<strong>", "`**` must render as emphasis, not print as asterisks"
      assert_not_includes html, "&amp;quot;", "the double-escaping that showed `&quot;` to students"
    end

    private

    def document(heading, canonical)
      "#{heading}\n\n#{canonical}\n#{TRAILING}"
    end

    def parse_one(type)
      heading, canonical = ACCUMULATORS.fetch(type)
      parse_one_of(heading, canonical, type)
    end

    def parse_one_of(heading, canonical, type)
      sections = LessonSectionParser.call(document(heading, canonical))
      sections.find { |s| s[:type] == type } ||
        flunk("no #{type} section was parsed from the document")
    end

    # Everything the student sees as structured data. `:body` is excluded on
    # purpose: it is the verbatim source the section was cut from, and the
    # scenario partial never renders it. `:aftermath` is the new, deliberate home
    # for the tail.
    def parsed_fields(section)
      section.except(:body, :aftermath, :type)
    end
  end
end
