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
