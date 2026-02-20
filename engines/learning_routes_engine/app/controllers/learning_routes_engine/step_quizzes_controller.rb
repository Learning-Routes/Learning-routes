module LearningRoutesEngine
  class StepQuizzesController < ApplicationController
    before_action :authenticate_user!
    before_action :set_route_and_step
    before_action :authorize_route_owner!
    before_action :set_quiz, only: [ :submit, :retry_quiz ]

    layout "learning"

    def submit
      @questions = @quiz.questions.order(:created_at)
      correct = 0

      @questions.each do |question|
        answer_value = params.dig(:answers, question.id)
        next unless answer_value.present?

        user_answer = Assessments::UserAnswer.find_or_initialize_by(
          user: current_user, question: question
        )
        user_answer.answer = answer_value

        is_correct = normalize_answer(answer_value) == normalize_answer(question.correct_answer)
        user_answer.correct = is_correct
        user_answer.feedback = is_correct ? I18n.t("learning_engine.step_quiz.correct") : question.explanation
        user_answer.save!

        correct += 1 if is_correct
      end

      total = @questions.count
      score = total > 0 ? (correct.to_f / total * 100).round(2) : 0

      @result = Assessments::AssessmentResult.create!(
        user: current_user,
        assessment: @quiz,
        score: score
      )

      @answers = Assessments::UserAnswer.where(
        user: current_user, question: @questions
      ).includes(:question)

      if @result.passed?
        tracker = RouteProgressTracker.new(@route)
        tracker.complete_step!(@step)

        Analytics::StudySession.for_user(current_user)
          .active.where(route_step_id: @step.id)
          .find_each(&:finish!)

        @next_step = @route.route_steps
          .where("position > ?", @step.position)
          .where(status: [ :available ])
          .order(:position).first
      end

      respond_to do |format|
        format.turbo_stream
        format.html { redirect_to learning_routes_engine.route_step_path(@route, @step) }
      end
    end

    def retry_quiz
      Assessments::UserAnswer.where(
        user: current_user,
        question: @quiz.questions
      ).destroy_all

      @questions = @quiz.questions.order(:created_at)

      respond_to do |format|
        format.turbo_stream
        format.html { redirect_to learning_routes_engine.route_step_path(@route, @step) }
      end
    end

    def check_status
      quiz = @step.step_quiz
      if quiz
        @quiz = quiz
        @questions = quiz.questions.order(:created_at)
        respond_to do |format|
          format.turbo_stream { render :quiz_ready }
        end
      else
        head :no_content
      end
    end

    private

    def set_route_and_step
      @route = LearningRoute.find(params[:route_id])
      @step = @route.route_steps.find(params[:step_id])
    end

    def authorize_route_owner!
      unless @route.learning_profile.user_id == current_user.id
        redirect_to main_app.dashboard_path, alert: I18n.t("learning_engine.not_authorized")
      end
    end

    def set_quiz
      @quiz = @step.step_quiz
      unless @quiz
        redirect_to learning_routes_engine.route_step_path(@route, @step),
                    alert: I18n.t("learning_engine.step_quiz.not_ready")
      end
    end

    def normalize_answer(value)
      value.to_s.strip.downcase.gsub(/\A([a-d])\)?\s*/, '\1')
    end
  end
end
