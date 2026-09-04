module Assessments
  class AnswersController < ApplicationController
    before_action :authenticate_user!
    before_action :set_assessment
    before_action :authorize_assessment_owner!

    def create
      question = @assessment.questions.find(params[:question_id])

      # The attempt this answer belongs to. Without one the student has not
      # started (or has already submitted), and there is nothing to answer INTO.
      @result = in_progress_result
      return refuse(:no_attempt) if @result.nil?

      # Answers are FINAL once given. Previously an answer could be updated in
      # place and re-graded unlimited times, so a student could click each option
      # until it showed "correct" and guarantee 100%. The DB unique index on
      # (user_id, question_id) is the real guard: it also stops the CONCURRENT
      # variant where parallel POSTs (one per option) each slip past find_by and
      # create a separately-graded row. We create-or-find and never re-grade.
      existing = UserAnswer.find_by(assessment_result: @result, question: question)
      if existing
        @answer = existing
      else
        begin
          @answer = UserAnswer.create!(
            user: current_user,
            question: question,
            assessment_result: @result,
            answer: params[:answer]
          )
          grade_answer!(question, @answer)
        rescue ActiveRecord::RecordNotUnique
          # A concurrent request already created (and graded) the answer.
          # Serve that locked row without re-grading.
          @answer = UserAnswer.find_by!(assessment_result: @result, question: question)
        end
      end

      respond_to do |format|
        format.turbo_stream
        format.html { redirect_to assessment_path(@assessment) }
      end
    end

    private

    # The caller's OPEN attempt, or nil.
    #
    # This replaces `submitted?`, which asked "has this user ever been scored on
    # this assessment" and answered with `where.not(score: nil).exists?`. A score
    # of 0.0 is not nil — and 0.0 is exactly what the earlier broken flow
    # produced — so one scored attempt refused every future answer with 422,
    # permanently, for that user and that assessment. The refusal then recreated
    # the state that caused it: no answers saved -> submit counts zero -> another
    # 0.0 result.
    #
    # "Is THIS attempt still open" is the question that was always meant.
    def in_progress_result
      AssessmentResult
        .where(user: current_user, assessment: @assessment, score: nil)
        .order(:created_at)
        .last
    end

    # A refusal the student can see. Four packages in a row have now been the
    # client not telling the student the server said no (WP-24 §1, WP-25 §2,
    # WP-26 §1, and this) — the reason is in the body so the widget can say it.
    def refuse(reason)
      render json: { error: reason, message: t("assessments.answers.#{reason}") },
             status: :unprocessable_entity
    end

    def grade_answer!(question, answer)
      if question.multiple_choice?
        # THE shared normalizer. This line used to be a bare downcased string
        # comparison, and the radio's value is the option verbatim
        # ("A) Subject + Verb + Object") while the generator stores "A" — so it
        # was `"a) subject + verb + object" == "a"`, false, always. No
        # multiple-choice answer had ever graded correct on an assessment.
        is_correct = AnswerNormalizer.correct?(
          given: params[:answer], expected: question.correct_answer
        )
        answer.update!(
          correct: is_correct,
          feedback: is_correct ? t("flash.correct") : t("flash.incorrect", explanation: question.explanation)
        )
      elsif question.short_answer? || question.code?
        grade_with_ai!(question, answer)
      end
    end

    # Eager-loads what `authorize_assessment_owner!` walks on every request:
    # route_step -> learning_route -> learning_profile. Same bare-`find` defect
    # WP-25 fixed in AssessmentsController; `strict_loading_by_default` only LOGS
    # in production, so this was an N+1 on every answer save rather than a
    # visible failure.
    def set_assessment
      @assessment = Assessment
        .includes(route_step: { learning_route: :learning_profile })
        .find(params[:assessment_id])
    end

    def authorize_assessment_owner!
      step = @assessment.route_step
      route = step.learning_route
      head(:forbidden) unless route&.learning_profile&.user_id == current_user.id
    end

    def grade_with_ai!(question, answer)
      # From the route behind the assessment, not I18n.locale — the grading feedback is
      # part of the course, so it follows the course's language rather than the
      # browser's UI preference.
      route = @assessment.route_step&.learning_route

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :quick_grading,
        variables: {
          question: question.body,
          expected_answer: question.correct_answer.to_s,
          student_answer: answer.answer,
          **AiOrchestrator::LocaleResolver.for_route(route, user: current_user)
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
