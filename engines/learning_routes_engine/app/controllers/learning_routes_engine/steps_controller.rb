module LearningRoutesEngine
  class StepsController < ApplicationController
    before_action :authenticate_user!
    before_action :set_route_and_step
    before_action :authorize_route_owner!
    before_action :ensure_step_accessible!, only: [:show]

    layout "learning"

    def show
      mark_in_progress_if_available!
      load_step_content
      @study_session = find_or_start_study_session
      @notes = ContentEngine::UserNote.for_user(current_user).for_step(@step).ordered
      @progress = RouteProgressTracker.new(@route).progress_summary
    end

    def complete
      # Gate lesson/exercise steps behind a mini-quiz
      if @step.requires_quiz? && !@step.quiz_passed_by?(current_user)
        @step_quiz = @step.step_quiz
        if @step_quiz.nil?
          StepQuizGenerationJob.perform_later(@step.id) unless @step.metadata&.dig("step_quiz_generated")
          @quiz_generating = true
        else
          @questions = @step_quiz.questions.order(:created_at)
        end

        respond_to do |format|
          format.turbo_stream { render :show_quiz }
          format.html { redirect_to route_step_path(@route, @step), notice: t("learning_engine.step_quiz.required") }
        end
        return
      end

      tracker = RouteProgressTracker.new(@route)
      tracker.complete_step!(@step)
      finish_study_session!

      next_available = @route.route_steps
        .where("position > ?", @step.position)
        .where(status: [:available])
        .order(:position).first

      respond_to do |format|
        format.html { redirect_to route_step_path(@route, next_available || @step), notice: "Step completed!" }
        format.turbo_stream
      end
    end

    private

    def set_route_and_step
      @route = LearningRoute.find(params[:route_id])
      @step = @route.route_steps.find(params[:id])
    end

    def authorize_route_owner!
      unless @route.learning_profile.user_id == current_user.id
        redirect_to main_app.dashboard_path, alert: "Not authorized."
      end
    end

    def ensure_step_accessible!
      if @step.locked?
        redirect_to learning_routes_engine.route_path(@route),
                    alert: "This step is not yet available."
      end
    end

    def mark_in_progress_if_available!
      @step.update!(status: :in_progress) if @step.available?
    end

    def load_step_content
      case @step.content_type
      when "lesson"
        @content = ContentEngine::AiContent.where(route_step: @step).by_type(:text).first
        unless @content
          begin; LearningRoutesEngine::ContentGenerationJob.perform_later(@step.id); rescue => e; Rails.logger.error("Content generation failed for step ##{@step.id}: #{e.message}"); end
          @content_generating = true
        end
        @rendered_html = ContentEngine::MarkdownRenderer.render(@content.body) if @content
      when "exercise"
        @content = ContentEngine::AiContent.where(route_step: @step).by_type(:exercise).first
        unless @content
          begin; LearningRoutesEngine::ContentGenerationJob.perform_later(@step.id); rescue => e; Rails.logger.error("Content generation failed for step ##{@step.id}: #{e.message}"); end
          @content_generating = true
        end
        @rendered_html = ContentEngine::MarkdownRenderer.render(@content.body) if @content
      when "assessment"
        @assessment = Assessments::Assessment.find_by(route_step: @step)
        unless @assessment
          begin; LearningRoutesEngine::AssessmentGenerationJob.perform_later(@step.id); rescue => e; Rails.logger.error("Assessment generation failed for step ##{@step.id}: #{e.message}"); end
          @assessment_generating = true
        end
        @existing_result = Assessments::AssessmentResult.find_by(
          user: current_user, assessment: @assessment
        ) if @assessment
      when "review"
        @retrievability = SpacedRepetition.new.retrievability(@step)
        @review_steps = @route.route_steps.completed_steps.where.not(id: @step.id).order(:position).limit(20)
      end
    end

    def find_or_start_study_session
      existing = Analytics::StudySession.for_user(current_user)
        .active
        .find_by(route_step_id: @step.id)
      existing || Analytics::StudySession.create!(
        user: current_user,
        learning_route: @route,
        route_step: @step,
        started_at: Time.current
      )
    end

    def finish_study_session!
      Analytics::StudySession.for_user(current_user)
        .active
        .where(route_step_id: @step.id)
        .find_each(&:finish!)
    end
  end
end
