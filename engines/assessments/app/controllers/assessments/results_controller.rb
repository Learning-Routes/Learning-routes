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
        redirect_to assessments.assessment_path(@assessment), alert: "Assessment not yet submitted."
        return
      end

      @answers = UserAnswer.where(user: current_user, question: @assessment.questions).includes(:question)
    end

    def submit
      assessment = @result.assessment
      step = assessment.route_step
      route = step.learning_route

      answers = UserAnswer.where(user: current_user, question: assessment.questions)
      total = assessment.questions.count
      correct = answers.where(correct: true).count
      score = total > 0 ? (correct.to_f / total * 100).round(2) : 0

      @result.update!(
        score: score,
        knowledge_gaps_identified: identify_gaps(assessment, answers)
      )

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

      # Gap analysis in background
      LearningRoutesEngine::GapAnalysisJob.perform_later(
        route.id, @result.id
      )

      # Complete step
      tracker = LearningRoutesEngine::RouteProgressTracker.new(route)
      tracker.complete_step!(step)

      Analytics::ProgressSnapshot.take_snapshot!(
        user: current_user,
        learning_route: route
      )

      redirect_to result_path(@result), notice: "Assessment submitted! Score: #{score.round(1)}%"
    end

    private

    def set_result
      @result = AssessmentResult.find(params[:id])
    end

    def authorize_result_owner!
      unless @result.user_id == current_user.id
        redirect_to main_app.dashboard_path, alert: "Not authorized."
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
