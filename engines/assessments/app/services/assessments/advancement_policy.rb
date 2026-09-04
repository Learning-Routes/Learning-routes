# frozen_string_literal: true

module Assessments
  # WP-29 §3: may this attempt advance the student past the step?
  #
  # `submit` called `complete_step!` unconditionally, so FAILING the exam
  # completed it and unlocked the next one. The assessment was decoration: a
  # score was recorded, a pass/fail flag was set, and nothing read either. A
  # student could score 0% four times and walk the whole route.
  #
  # Gating on `passed?` alone would swap one broken outcome for a worse one — a
  # student trapped forever behind a question whose answer key is wrong, which
  # this codebase has already shipped twice (§1 here, and the bad answer key that
  # `BlockAttempt::RELEASE_AFTER` exists to escape). So there are three ways
  # forward and they are not the same event:
  #
  #   passed       they earned it
  #   released     they failed RELEASE_AFTER times and we stop blocking them
  #   unanswerable the exam cannot be passed by anyone; it must never gate
  #
  # Only the first is passing. The other two advance the student while recording
  # on the step that they did NOT pass, so progress reports and any future
  # remediation can tell the difference.
  class AdvancementPolicy
    # The house precedent for an escape valve, referenced rather than re-declared
    # so the two cannot drift apart.
    RELEASE_AFTER = LearningRoutesEngine::BlockAttempt::RELEASE_AFTER

    Decision = Struct.new(:reason, :attempts, keyword_init: true) do
      def advance? = %i[passed released unanswerable].include?(reason)
      def passed? = reason == :passed
      def released? = reason == :released
      def unanswerable? = reason == :unanswerable
      def blocked? = reason == :blocked
      def attempts_left = [RELEASE_AFTER - attempts.to_i, 0].max
    end

    def initialize(result:)
      @result = result
      @assessment = result.assessment
    end

    def decide
      return Decision.new(reason: :passed, attempts: failed_attempts) if @result.passed?
      # Checked BEFORE the release count: a student on their first attempt at an
      # exam nobody can pass should not have to fail it three times first.
      return Decision.new(reason: :unanswerable, attempts: failed_attempts) unless passable?
      return Decision.new(reason: :released, attempts: failed_attempts) if failed_attempts >= RELEASE_AFTER

      Decision.new(reason: :blocked, attempts: failed_attempts)
    end

    private

    # Scored attempts at THIS assessment that did not pass, including the one
    # being submitted — it is saved with its score before this runs.
    def failed_attempts
      @failed_attempts ||= AssessmentResult
        .where(user_id: @result.user_id, assessment_id: @assessment.id, passed: false)
        .where.not(score: nil)
        .count
    end

    # Can a student who answers everything correctly actually reach the pass
    # mark? A multiple-choice question whose `correct_answer` matches none of its
    # options is unanswerable — nobody can score it — so it caps the best
    # achievable score. If that cap is below `passing_score`, the exam is
    # impossible and must not gate anyone.
    #
    # Short-answer and code questions are counted as answerable: they are not
    # graded by option matching, so there is nothing here to prove them broken,
    # and guessing would trap students on a working exam.
    def passable?
      questions = @assessment.questions.select(:id, :question_type, :options, :correct_answer).to_a
      return false if questions.empty?

      answerable = questions.count do |question|
        next true unless question.question_type == "multiple_choice"

        AnswerNormalizer.answerable?(options: question.options, correct_answer: question.correct_answer)
      end

      best_possible = answerable.to_f / questions.size * 100
      best_possible >= @assessment.passing_score
    end
  end
end
