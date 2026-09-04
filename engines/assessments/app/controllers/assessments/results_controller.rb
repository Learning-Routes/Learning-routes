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
        redirect_to result_path(@result), notice: t("flash.assessment_submitted", score: @result.score.round(1))
        return
      end

      # End study session
      Analytics::StudySession.for_user(current_user)
        .active
        .where(route_step_id: step.id)
        .find_each(&:finish!)

      # Record metrics
      Analytics::LearningMetric.record!(
        user: current_user,
        metric_type: "average_score",
        value: score,
        subject: route.topic
      )

      # Adaptive difficulty adjustment
      LearningRoutesEngine::AdaptiveDifficulty.new(route, @result).adjust!

      # Gap analysis in background.
      #
      # GapAnalyzer and, through it, ReinforcementGenerator both make paid
      # Orchestrate calls, so this asks the GENERATION policy. This controller
      # authorizes on result ownership alone, which stays true after a refund —
      # so without this a refunded customer could keep submitting an assessment
      # generated while they were paid and commission two AI calls per submit.
      if LearningRoutesEngine::ModuleAccessPolicy.generation_allowed?(
        user: current_user, step_id: step.id
      )
        LearningRoutesEngine::GapAnalysisJob.perform_later(
          route.id, assessment_result_id: @result.id
        )
      end

      # Complete step
      tracker = LearningRoutesEngine::RouteProgressTracker.new(route)
      tracker.complete_step!(step)

      Analytics::ProgressSnapshot.take_snapshot!(
        user: current_user,
        learning_route: route
      )

      redirect_to result_path(@result), notice: t("flash.assessment_submitted", score: score.round(1))
    end

    private

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
