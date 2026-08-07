# frozen_string_literal: true

module ContentEngine
  # THE single source of truth for the lesson block vocabulary.
  #
  # Before this existed the vocabulary was declared in five places that had drifted
  # apart independently:
  #
  #   1. LessonSectionParser::BLOCK_TYPES      — which ::: fences parse
  #   2. LessonSectionParser::HEADING_TYPE_MAP — which ## Prefix: headings map to what
  #   3. MarkdownRenderer::INTERACTIVE_BLOCKS  — which ::: fences render
  #   4. steps/_lesson.html.erb                — a hardcoded array of types with partials
  #   5. the prompt YAMLs                      — what the model is told to emit
  #
  # (5) requested eleven ::: types of which (1) understood one, so the rest reached the
  # student as literal ":::tap_pairs" text. Everything here exists to make that a test
  # failure rather than a lesson defect.
  #
  # The prompts are VALIDATED against this module, not generated from it — see
  # WP6_CONTRACT.md §1. They carry per-family pedagogy and worked syntax examples that
  # no constant can express.
  #
  # ADDING A BLOCK TYPE means, in order: a parser branch, a partial, a Stimulus
  # controller if interactive, an entry here, and a prompt section teaching the model
  # its syntax. The contract test fails until all of them exist.
  module LessonBlocks
    # `fence`    — the :::name authors write, or nil if this type is not ::: authorable
    # `headings` — "## Prefix:" forms, bilingual, or [] if not heading authorable
    # `partial`  — the partial under steps/lesson_sections/ (all types need one)
    # `chrome`   — icon + css for MarkdownRenderer's ::: rendering, or nil if that
    #              renderer has no representation for it (structured blocks are rendered
    #              by their partial, not by the markdown pass)
    # `authored` — false when the app injects the section itself rather than the model
    #              writing it
    BLOCKS = {
      "concept" => {
        fence: "concept", headings: %w[Concepto Concept], partial: "concept",
        chrome: { icon: "\u{1F4A1}", css: "lesson-block--concept" }
      },
      "check" => {
        fence: "check", headings: %w[Pregunta Question], partial: "check",
        chrome: { icon: "\u{2753}", css: "lesson-block--check" }
      },
      "tip" => {
        fence: "tip", headings: %w[Tip Consejo], partial: "tip",
        chrome: { icon: "\u{1F4DD}", css: "lesson-block--tip" }
      },
      "example" => {
        fence: "example", headings: %w[Ejemplo Example], partial: "example",
        chrome: { icon: "\u{1F30D}", css: "lesson-block--example" }
      },
      "summary" => {
        fence: "summary", headings: %w[Resumen Summary], partial: "summary",
        chrome: { icon: "\u{2705}", css: "lesson-block--summary" }
      },
      "drag_drop" => {
        fence: "drag_drop", headings: %w[Match Emparejar], partial: "drag_drop", chrome: nil
      },
      "fill_blank" => {
        fence: "fill_blank", headings: %w[Complete Completa], partial: "fill_blank", chrome: nil
      },
      "code_playground" => {
        fence: "code_playground", headings: %w[Playground], partial: "code_playground", chrome: nil
      },
      "simulation" => {
        fence: "simulation", headings: %w[Simulation Simulacion], partial: "simulation", chrome: nil
      },
      "scenario" => {
        fence: "scenario", headings: %w[Scenario Escenario], partial: "scenario", chrome: nil
      },
      "flashcards" => {
        fence: "flashcards", headings: %w[Flashcards], partial: "flashcards", chrome: nil
      },
      # Heading-authored only: the body of a "## Visual:" section is the image prompt.
      "visual" => {
        fence: nil, headings: %w[Visual], partial: "visual", chrome: nil
      },
      # Injected by LessonSectionParser#inject_audio_section when TTS produced a file —
      # the model never writes these, so they have no authoring surface at all.
      "audio" => {
        fence: nil, headings: [], partial: "audio", chrome: nil, authored: false
      },
      "audio_explainer" => {
        fence: nil, headings: [], partial: "audio_explainer", chrome: nil, authored: false
      }
    }.freeze

    # Every declared section type.
    def self.types
      BLOCKS.keys
    end

    # Types the model may author with :::name syntax.
    def self.fence_types
      BLOCKS.filter_map { |type, cfg| cfg[:fence] }
    end

    # "## Prefix:" forms the model may author with, e.g. %w[Concepto Concept ...].
    def self.heading_prefixes
      BLOCKS.values.flat_map { |cfg| cfg[:headings] }
    end

    # prefix => type symbol, the shape LessonSectionParser::HEADING_TYPE_MAP needs.
    def self.heading_map
      BLOCKS.each_with_object({}) do |(type, cfg), map|
        cfg[:headings].each { |prefix| map[prefix] = type.to_sym }
      end.freeze
    end

    # fence name => chrome, the shape MarkdownRenderer::INTERACTIVE_BLOCKS needs.
    # Only types with chrome: the markdown pass has no representation for structured
    # blocks, which are rendered by their partial instead.
    def self.renderer_chrome
      BLOCKS.each_with_object({}) do |(_type, cfg), map|
        map[cfg[:fence]] = cfg[:chrome] if cfg[:fence] && cfg[:chrome]
      end.freeze
    end

    # Types with a partial — the whitelist steps/_lesson.html.erb dispatches against.
    def self.partial_types
      BLOCKS.filter_map { |type, cfg| type if cfg[:partial] }
    end

    # Types the model is expected to write. Excludes app-injected sections.
    def self.authored_types
      BLOCKS.filter_map { |type, cfg| type unless cfg[:authored] == false }
    end

    def self.partial_for(type)
      BLOCKS.dig(type.to_s, :partial)
    end

    def self.known?(type)
      BLOCKS.key?(type.to_s)
    end
  end
end
