module Assessments
  class AnswersController < ApplicationController
    before_action :authenticate_user!
    before_action :set_assessment
    before_action :authorize_assessment_owner!

    def create
      question = @assessment.questions.find(params[:question_id])

      # Once the assessment has been submitted/scored, answering is closed.
      return head(:unprocessable_entity) if submitted?

      # Answers are FINAL once given. Previously an answer could be updated in
      # place and re-graded unlimited times, so a student could click each option
      # until it showed "correct" and guarantee 100%. The DB unique index on
      # (user_id, question_id) is the real guard: it also stops the CONCURRENT
      # variant where parallel POSTs (one per option) each slip past find_by and
      # create a separately-graded row. We create-or-find and never re-grade.
      existing = UserAnswer.find_by(user: current_user, question: question)
      if existing
        @answer = existing
      else
        begin
          @answer = UserAnswer.create!(
            user: current_user,
            question: question,
            answer: params[:answer]
          )
          grade_answer!(question, @answer)
        rescue ActiveRecord::RecordNotUnique
          # A concurrent request already created (and graded) the answer.
          # Serve that locked row without re-grading.
          @answer = UserAnswer.find_by!(user: current_user, question: question)
        end
      end

      respond_to do |format|
        format.turbo_stream
        format.html { redirect_to assessment_path(@assessment) }
      end
    end

    private

    # True once an AssessmentResult for this user+assessment has been scored.
    def submitted?
      AssessmentResult
        .where(user: current_user, assessment: @assessment)
        .where.not(score: nil)
        .exists?
    end

    def grade_answer!(question, answer)
      if question.multiple_choice?
        is_correct = params[:answer].to_s.strip.downcase == question.correct_answer.to_s.strip.downcase
        answer.update!(
          correct: is_correct,
          feedback: is_correct ? t("flash.correct") : t("flash.incorrect", explanation: question.explanation)
        )
      elsif question.short_answer? || question.code?
        grade_with_ai!(question, answer)
      end
    end

    def set_assessment
      @assessment = Assessment.find(params[:assessment_id])
    end

    def authorize_assessment_owner!
      step = @assessment.route_step
      route = step.learning_route
      return head(:forbidden) unless route&.learning_profile&.user_id == current_user.id
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
