module Assessments
  class ResultsController < ApplicationController
    layout "learning"

    before_action :authenticate_user!
    before_action :set_result
    before_action :authorize_result_owner!

    def show
      @assessment = @result.assessment
      @step = @assessment.route_step
      @route = @step.learning_route

      unless @result.score.present?
        redirect_to assessments.assessment_path(@assessment), alert: t("flash.assessment_not_submitted")
        return
      end

      # The answers from THIS attempt, not every answer the user has ever given.
      @answers = @result.user_answers.includes(:question)
    end

    def submit
      assessment = @result.assessment
      step = assessment.route_step
      route = step.learning_route

      # Idempotency: a result that has already been scored must not be
      # re-processed. Replaying submit would double-count analytics/metrics and
      # re-fire the gap-analysis + difficulty jobs. The score-claim runs inside
      # a row lock so two concurrent submits can't both pass the check — only
      # the one that sets the score proceeds to the side effects below.
      score = nil
      @result.with_lock do
        if @result.score.present?
          score = :already_scored
        else
          # THIS attempt's answers. It used to be
          # `UserAnswer.where(user:, question: assessment.questions)`, which is
          # every answer the user has ever given to these questions — so every
          # retake re-counted the first attempt's rows and could never differ.
          answers = @result.user_answers
          total = assessment.questions.count
          correct = answers.where(correct: true).count
          score = total > 0 ? (correct.to_f / total * 100).round(2) : 0
          @result.update!(
            score: score,
            knowledge_gaps_identified: identify_gaps(assessment, answers)
          )
        end
      end

      if score == :already_scored
        # Not a no-op any more. A previous submit may have committed the score and
        # then failed its bookkeeping, which used to leave the paid analysis
        # skipped FOREVER — the retry short-circuited here and redirected. The
        # enqueue is claimed on the RESULT, so completing it now is safe and
        # cannot buy a second one.
        enqueue_gap_analysis_once(route, step)
        redirect_to result_path(@result), notice: t("flash.assessment_submitted", score: @result.score.round(1))
        return
      end

      # ORDER BY COST, and never let bookkeeping cost the student their result.
      #
      # These seven side effects run AFTER the score has committed and outside any
      # transaction. `take_snapshot!` used to raise here and 422 the request —
      # after the metric was written, difficulty adjusted, reinforcement steps
      # possibly inserted, the step completed, and the PAID GapAnalysisJob already
      # enqueued at step 4 of 6. The student saw nothing, started the exam again,
      # and bought the whole thing again.
      #
      # So: everything that can fail cheaply runs first, each isolated so one
      # failure cannot skip the rest; the spend runs LAST, once, on a claim.
      bookkeeping_ok = record_bookkeeping(route, step, score)

      # The spend happens only if everything cheap succeeded. Isolating the
      # failures above is what keeps the student's result reachable; it must NOT
      # also mean we shrug and buy the analysis anyway. A later submit can still
      # complete this — the claim is on the result, not the request.
      enqueue_gap_analysis_once(route, step) if bookkeeping_ok

      notice = if bookkeeping_ok
        t("flash.assessment_submitted", score: score.round(1))
      else
        # The score IS committed. Saying so is the one thing the app was certain
        # about and never told them.
        t("flash.assessment_submitted_with_issue", score: score.round(1))
      end

      redirect_to result_path(@result), notice: notice
    end

    private

    # Derived work. The score is already committed; none of this may deny the
    # student their result, and a failure in one step must not skip the others.
    # Returns false if ANY step failed, which is what stops the paid enqueue.
    def record_bookkeeping(route, step, score)
      results = []

      results << isolate("study session") do
        Analytics::StudySession.for_user(current_user).active
          .where(route_step_id: step.id).find_each(&:finish!)
      end

      results << isolate("learning metric") do
        Analytics::LearningMetric.record!(
          user: current_user, metric_type: "average_score", value: score, subject: route.topic
        )
      end

      results << isolate("adaptive difficulty") do
        LearningRoutesEngine::AdaptiveDifficulty.new(route, @result).adjust!
      end

      results << isolate("complete step") do
        LearningRoutesEngine::RouteProgressTracker.new(route).complete_step!(step)
      end

      results << isolate("progress snapshot") do
        Analytics::ProgressSnapshot.take_snapshot!(user: current_user, learning_route: route)
      end

      results.all?
    end

    # NOT idempotent, so it is not retried: `AdaptiveDifficulty#adjust!` inserts
    # reinforcement steps and `LearningMetric.record!` is a bare `create!`. A
    # failure is logged with the result id and left alone rather than duplicated
    # on the next submit. The paid enqueue is the one piece that IS repairable,
    # because it has a claim.
    def isolate(label)
      yield
      true
    rescue StandardError => e
      Rails.logger.error(
        "[ResultsController#submit] #{label} failed for result #{@result.id}: #{e.class}: #{e.message}"
      )
      false
    end

    # The spend, exactly once per attempt.
    #
    # A conditional UPDATE is the claim: only the caller whose UPDATE actually
    # matches a row with a NULL marker may enqueue, so concurrent submits and
    # retries after a failure can never buy two analyses.
    def enqueue_gap_analysis_once(route, step)
      # GapAnalyzer and ReinforcementGenerator are paid Orchestrate calls, so this
      # asks the GENERATION policy — this controller authorizes on result
      # ownership alone, which stays true after a refund.
      return unless LearningRoutesEngine::ModuleAccessPolicy.generation_allowed?(
        user: current_user, step_id: step.id
      )

      claimed = AssessmentResult
        .where(id: @result.id, gap_analysis_enqueued_at: nil)
        .update_all(gap_analysis_enqueued_at: Time.current)
      return unless claimed == 1

      LearningRoutesEngine::GapAnalysisJob.perform_later(route.id, assessment_result_id: @result.id)
    end

    # Eager-loads the chain `submit` walks: assessment -> route_step ->
    # learning_route, plus the questions it scores against.
    #
    # This was a bare `find`, so `@result.assessment` on the first line of
    # `submit` was a strict-loading violation on every assessment submission —
    # invisible because production only LOGS violations and no test reached this
    # action. It raises the moment one does.
    def set_result
      @result = AssessmentResult
        .includes(assessment: [:questions, { route_step: :learning_route }])
        .find(params[:id])
    end

    def authorize_result_owner!
      unless @result.user_id == current_user.id
        redirect_to main_app.dashboard_path, alert: t("flash.not_authorized")
        nil
      end
    end

    def identify_gaps(assessment, answers)
      answers.where(correct: false).includes(:question).map do |ua|
        q = ua.question
        {
          "question_id" => q.id,
          "topic" => q.body.to_s.truncate(100),
          "difficulty" => q.difficulty,
          "bloom_level" => q.bloom_level,
          "question_type" => q.question_type
        }
      end
    end
  end
end
