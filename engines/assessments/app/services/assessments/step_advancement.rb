# frozen_string_literal: true

module Assessments
  # The one place that turns an AdvancementPolicy decision into a step's history.
  #
  # WP-29 §3 taught `results#submit` to ask the policy before completing an
  # assessment step. It did not teach the OTHER door: the header's "Completar
  # paso" posts to `LearningRoutesEngine::StepsController#complete`, which gated
  # on interactive blocks and the step quiz — two things an assessment step never
  # has — and then completed the step unconditionally. A student who scored 0%
  # clicked once and walked past the exam, with nothing recorded to say so.
  #
  # Both doors now ask the same two questions through this class:
  #
  #   .decide_for  which scored attempt are we judging, and what does the policy
  #                say about it?
  #   .record!     an advance that is not a pass leaves a mark on the step.
  #
  # `record!` exists because the two doors were writing the same three metadata
  # keys and would have drifted the moment one of them learned a fourth. It is a
  # deliberate copy of what `results#submit` already did, moved rather than
  # duplicated — see AdvancementPolicy for why "advance" and "pass" are not the
  # same event.
  module StepAdvancement
    module_function

    # The policy's verdict on this user's latest SCORED attempt at this step's
    # assessment, or nil when there is nothing to judge — no assessment, or no
    # attempt that has been scored yet.
    #
    # Latest scored, not "any": `find_by(user:, assessment:)` with no order and
    # no score filter is what §2 of this package is about. An open attempt has no
    # score and cannot advance anyone.
    def decide_for(user:, step:)
      assessment = Assessment.find_by(route_step: step, assessment_type: exam_types)
      return nil if assessment.nil?

      result = latest_scored_result(user: user, assessment: assessment)
      return nil if result.nil?

      AdvancementPolicy.new(result: result).decide
    end

    # Eager-loads the chain AdvancementPolicy walks: `result.assessment` on
    # construction and `assessment.questions` in `passable?`. `strict_loading` is
    # on by default in this app and only LOGS in production, so a lazy hop here
    # would raise in test and pass silently in production — the worst of both.
    def latest_scored_result(user:, assessment:)
      AssessmentResult
        .includes(assessment: :questions)
        .latest_scored_for(user: user, assessment: assessment)
    end

    # An escape valve is not a pass. Recorded on the step so a progress report,
    # and anything built on it later, can tell "earned it" from "we stopped
    # blocking them". A genuine pass writes nothing: absence of these keys is
    # what "passed" looks like.
    def record!(step:, decision:)
      return false if decision.passed?

      step.merge_metadata!(
        "advanced_without_passing" => true,
        "advanced_reason" => decision.reason.to_s,
        "advanced_at" => Time.current.utc.iso8601
      )
      true
    end

    # Every assessment type except `step_quiz`, which is the lesson/exercise
    # comprehension check and is gated by `RouteStep#requires_quiz?`, not by this.
    def exam_types
      Assessment.assessment_types.keys - ["step_quiz"]
    end
  end
end
