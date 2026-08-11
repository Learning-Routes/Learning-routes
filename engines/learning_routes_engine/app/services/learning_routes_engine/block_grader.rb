# frozen_string_literal: true

module LearningRoutesEngine
  # Re-grades a block submission against the section stored on the step.
  #
  # The client's claim about correctness is discarded. Only the raw submission — which
  # option, which pairing, which strings — is read from the request, and the verdict is
  # computed here against step.metadata["parsed_sections"][section_index], which the
  # server already holds.
  #
  # This does not stop a student reading `data-correct="true"` out of the DOM. It stops
  # our RECORDS being fiction, which is what FSRS and gap analysis consume. See
  # WP10_DESIGN.md §5.
  class BlockGrader
    Result = Struct.new(:correct, :score, :gradable, :reason, keyword_init: true) do
      def gradable? = gradable
      # An ungradable block still "completes" — it records engagement, not mastery.
      def engagement_only? = !gradable
    end

    # Types whose correctness we can actually establish from the parsed section.
    # Everything else in ContentEngine::LessonBlocks is engagement-only BY DEFAULT, so
    # adding a block type can never silently become "gates progression with no way to
    # pass" (WP10_DESIGN.md §6).
    GRADABLE_TYPES = %w[check drag_drop fill_blank].freeze

    # Gradable, plus the types that must be interacted with before a step completes.
    # simulation and code_playground are absent deliberately: code runs in the browser
    # and the server never sees it, so "ran once" is an unverifiable claim.
    GATING_TYPES = (GRADABLE_TYPES + %w[flashcards scenario]).freeze

    def initialize(section:, payload:)
      @section = (section || {}).with_indifferent_access
      @payload = (payload || {}).with_indifferent_access
    end

    def self.gradable?(block_type) = GRADABLE_TYPES.include?(block_type.to_s)
    def self.gating?(block_type)   = GATING_TYPES.include?(block_type.to_s)

    def call
      type = @section[:type].to_s
      return ungradable("unknown block type #{type.inspect}") unless ContentEngine::LessonBlocks.known?(type)
      return ungradable("#{type} is engagement-only") unless self.class.gradable?(type)

      case type
      when "check"      then grade_check
      when "drag_drop"  then grade_drag_drop
      when "fill_blank" then grade_fill_blank
      end
    end

    private

    # Fail OPEN on data quality: a section we cannot grade must never trap a student
    # behind our own generation bug. Fail CLOSED on effort is the caller's job.
    def ungradable(reason)
      Result.new(correct: nil, score: nil, gradable: false, reason: reason)
    end

    def graded(correct, score)
      Result.new(correct: correct, score: score, gradable: true, reason: nil)
    end

    # ── check: one correct option among several ──────────────────────────
    def grade_check
      options = Array(@section[:options])
      return ungradable("check has no options") if options.empty?

      correct_index = options.index { |o| o.with_indifferent_access[:correct] }
      return ungradable("check has no option marked correct") if correct_index.nil?

      chosen = @payload[:option_index]
      return graded(false, 0) if chosen.nil?

      hit = chosen.to_i == correct_index
      graded(hit, hit ? 100 : 0)
    end

    # ── drag_drop: term i pairs with definition i ────────────────────────
    def grade_drag_drop
      pairs = Array(@section[:pairs])
      return ungradable("drag_drop has no pairs") if pairs.empty?

      # payload: { "matches": { "<term_index>": <definition_index>, ... } }
      matches = (@payload[:matches] || {}).to_h
      return graded(false, 0) if matches.empty?

      hits = pairs.each_index.count { |i| matches[i.to_s].to_s == i.to_s }
      score = (hits.to_f / pairs.size * 100).round(2)
      graded(hits == pairs.size, score)
    end

    # ── fill_blank: every blank must match ──────────────────────────────
    def grade_fill_blank
      blanks = Array(@section[:blanks]).map(&:to_s).reject(&:blank?)
      return ungradable("fill_blank has no blanks") if blanks.empty?

      answers = Array(@payload[:answers]).map(&:to_s)
      return graded(false, 0) if answers.empty?

      hits = blanks.each_with_index.count do |expected, i|
        normalize(answers[i]) == normalize(expected)
      end
      score = (hits.to_f / blanks.size * 100).round(2)
      graded(hits == blanks.size, score)
    end

    # Accent- and case-insensitive, whitespace-collapsed. A Spanish learner typing
    # "obrigado" for "Obrigado" is right, and so is one who cannot produce "ó".
    def normalize(value)
      value.to_s
           .unicode_normalize(:nfd)
           .gsub(/\p{Mn}/, "")
           .downcase
           .gsub(/[[:punct:]]/, "")
           .gsub(/\s+/, " ")
           .strip
    end
  end
end
