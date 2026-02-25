module Assessments
  class AnswersController < ApplicationController
    before_action :authenticate_user!
    before_action :set_assessment
    before_action :authorize_assessment_owner!

    def create
      question = @assessment.questions.find(params[:question_id])

      existing = UserAnswer.find_by(user: current_user, question: question)
      if existing
        existing.update!(answer: params[:answer])
        @answer = existing
      else
        @answer = UserAnswer.create!(
          user: current_user,
          question: question,
          answer: params[:answer]
        )
      end

      if question.multiple_choice?
        is_correct = params[:answer].to_s.strip.downcase == question.correct_answer.to_s.strip.downcase
        @answer.update!(
          correct: is_correct,
          feedback: is_correct ? t("flash.correct") : t("flash.incorrect", explanation: question.explanation)
        )
      elsif question.short_answer? || question.code?
        grade_with_ai!(question, @answer)
      end

      respond_to do |format|
        format.turbo_stream
        format.html { redirect_to assessment_path(@assessment) }
      end
    end

    private

    def set_assessment
      @assessment = Assessment.find(params[:assessment_id])
    end

    def authorize_assessment_owner!
      step = @assessment.route_step
      route = step.learning_route
      return head(:forbidden) unless route.learning_profile.user_id == current_user.id
    end

    def grade_with_ai!(question, answer)
      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :quick_grading,
        variables: {
          question: question.body,
          expected_answer: question.correct_answer.to_s,
          student_answer: answer.answer
        },
        user: current_user,
        async: false
      )

      if interaction.completed?
        parser = AiOrchestrator::ResponseParser.new(
          interaction.response,
          expected_format: :json,
          task_type: "quick_grading"
        )
        result = parser.parse!
        answer.update!(
          correct: result["score"].to_f >= 70,
          feedback: result["feedback"]
        )
      end
    rescue StandardError => e
      Rails.logger.error("[AnswersController] AI grading failed: #{e.class}: #{e.message}")
    end
  end
end
