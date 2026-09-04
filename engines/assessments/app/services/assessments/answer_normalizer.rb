# frozen_string_literal: true

module Assessments
  # THE single place an answer is compared to `correct_answer`.
  #
  # There were two graders for one vocabulary and only one of them normalized:
  #
  #   step_quizzes_controller.rb  normalize_answer(a) == normalize_answer(b)   ✅
  #   answers_controller.rb       a.strip.downcase == b.strip.downcase         ❌
  #
  # The radio's value is the option verbatim ("A) Subject + Verb + Object") and
  # the generator stores `"correct_answer": "A"`, so the second comparison was
  # `"a) subject + verb + object" == "a"` — false, always. NO multiple-choice
  # answer has ever graded correct on an assessment. Someone hit this on the
  # step-quiz path, fixed it there, and left the other grader alone. Sixth
  # instance of the two-copies class in this codebase.
  #
  # BOTH stored formats exist in production, because the two generator prompts
  # disagree with each other:
  #
  #   assessment_questions.yml:29   "correct_answer": "A"
  #   exam_questions.yml:29         "correct_answer": "The correct answer"
  #
  # So a letter-prefixed option has to grade correctly against a bare letter AND
  # against the full option text. The old `normalize_answer` handled only the
  # first: it mapped "a) subject…" to "a", which never equals "subject…". Fixing
  # the call site without fixing that would have left every exam_questions.yml
  # assessment failing for a different reason.
  class AnswerNormalizer
    # "A) ", "a. ", "B)" — the option-letter prefix the generators emit.
    LETTER_PREFIX = /\A([a-z])[).:]\s*/
    BARE_LETTER   = /\A[a-z]\z/

    class << self
      # Is `given` the answer `expected` describes?
      def correct?(given:, expected:)
        chosen   = clean(given)
        solution = clean(expected)
        return false if chosen.empty? || solution.empty?
        return true if chosen == solution

        chosen_letter, chosen_body = split(chosen)
        solution_letter, solution_body = split(solution)

        # "correct_answer": "A" — compare letters.
        return chosen_letter == solution if solution.match?(BARE_LETTER)
        # The mirror, for data that stores the letter on the answer instead.
        return solution_letter == chosen if chosen.match?(BARE_LETTER)

        # Both carry a letter: the letter decides.
        return chosen_letter == solution_letter if chosen_letter && solution_letter

        # "correct_answer": "The correct answer" — compare the option's TEXT with
        # its prefix removed.
        chosen_body == solution_body
      end

      # Does any option actually match this question's `correct_answer`?
      #
      # §3's twin: an assessment whose stored answer matches none of its options
      # is unanswerable, and an unanswerable question must never gate a student.
      # This is the check that would have caught the defect above.
      def answerable?(options:, correct_answer:)
        options = Array(options).map(&:to_s).reject(&:blank?)
        return false if options.empty? || correct_answer.to_s.strip.empty?

        options.any? { |option| correct?(given: option, expected: correct_answer) }
      end

      private

      def clean(value)
        value.to_s.strip.downcase.gsub(/\A"(.+)"\z/, '\1').strip
      end

      # "a) subject + verb" -> ["a", "subject + verb"]
      # "subject + verb"    -> [nil, "subject + verb"]
      def split(value)
        match = value.match(LETTER_PREFIX)
        return [nil, value] if match.nil?

        [match[1], value.sub(LETTER_PREFIX, "").strip]
      end
    end
  end
end
