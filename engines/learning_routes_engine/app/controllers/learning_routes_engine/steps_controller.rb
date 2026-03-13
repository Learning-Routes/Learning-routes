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

    # Turbo Frame polling endpoint — returns just the step content frame
    def content_status
      load_step_content
      render partial: "step_content_frame", layout: false
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
          format.json { render json: { quiz_required: true }, status: :unprocessable_entity }
          format.turbo_stream { render :show_quiz }
          format.html { redirect_to route_step_path(@route, @step), notice: t("learning_engine.step_quiz.required") }
        end
        return
      end

      tracker = RouteProgressTracker.new(@route)
      tracker.complete_step!(@step)
      @xp_result = tracker.xp_result
      finish_study_session!

      # Award lesson-specific XP (on top of step_complete XP from tracker)
      lesson_xp = award_lesson_xp!

      next_available = @route.route_steps
        .where("position > ?", @step.position)
        .where(status: [:available])
        .order(:position).first

      respond_to do |format|
        format.json do
          engagement = current_user.user_engagement
          render json: {
            xp_gained: (@xp_result&.dig(:xp_gained) || 0) + (lesson_xp || 0),
            total_xp: engagement&.total_xp || 0,
            level: engagement&.current_level || 1,
            leveled_up: @xp_result&.dig(:leveled_up) || false,
            streak: engagement&.current_streak || 0,
            route_completed: @route.completed?,
            next_step_id: next_available&.id,
            next_step_title: next_available&.localized_title,
            next_step_url: next_available ? route_step_path(@route, next_available) : nil,
            route_url: route_path(@route)
          }
        end
        format.html { redirect_to route_step_path(@route, next_available || @step), notice: t("flash.step_completed") }
        format.turbo_stream
      end
    end

    private

    def set_route_and_step
      @route = LearningRoute.find(params[:route_id])
      @step = @route.route_steps.find(params[:id])
    end

    def authorize_route_owner!
      unless @route.learning_profile&.user_id == current_user.id
        redirect_to main_app.dashboard_path, alert: t("flash.not_authorized")
        return
      end
    end

    def ensure_step_accessible!
      if @step.locked?
        redirect_to learning_routes_engine.route_path(@route),
                    alert: t("flash.step_not_available")
        return
      end
    end

    def mark_in_progress_if_available!
      @step.update!(status: :in_progress) if @step.available?
    end

    def load_step_content
      # For audio delivery format, handle audio-specific content loading
      if @step.delivery_format == "audio"
        load_audio_content
        return
      end

      case @step.content_type
      when "lesson"
        @content = ContentEngine::AiContent.where(route_step: @step).by_type(:text).first
        unless @content
          # Use the pipeline job instead of the simple content generation job
          if @step.metadata&.dig("content_generating")
            @content_generating = true
          else
            begin
              LearningRoutesEngine::ContentPipelineJob.perform_later(@step.id)
            rescue => e
              Rails.logger.error("Content pipeline failed for step ##{@step.id}: #{e.message}")
            end
            @content_generating = true
          end
        end
        if @content
          cached = @step.metadata&.dig("parsed_sections")
          if cached.is_a?(Array) && cached.any?
            @sections = cached.map(&:deep_symbolize_keys)
          else
            @sections = ContentEngine::LessonSectionParser.call(
              @content.body,
              metadata: @step.metadata || {},
              audio_url: @content.audio_url
            )
          end
          @rendered_html = ContentEngine::MarkdownRenderer.render(@content.body)
        end
      when "exercise"
        @content = ContentEngine::AiContent.where(route_step: @step).by_type(:exercise).first
        unless @content
          if @step.metadata&.dig("content_generating")
            @content_generating = true
          else
            begin
              LearningRoutesEngine::ContentPipelineJob.perform_later(@step.id)
            rescue => e
              Rails.logger.error("Content pipeline failed for step ##{@step.id}: #{e.message}")
            end
            @content_generating = true
          end
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

    # Load content for audio delivery format steps
    # Always loads text content as fallback so the lesson is viewable even if audio fails
    def load_audio_content
      @content = ContentEngine::AiContent.where(route_step: @step).by_type(:text).first

      # If no text content yet, generate it first via pipeline
      unless @content
        unless @step.metadata&.dig("content_generating")
          begin
            LearningRoutesEngine::ContentPipelineJob.perform_later(@step.id, { pregenerate_audio: true })
          rescue => e
            Rails.logger.error("Content pipeline failed for audio step ##{@step.id}: #{e.message}")
          end
        end
        @content_generating = true
        return
      end

      # Always parse sections/rendered_html so text fallback works
      if @content
        cached = @step.metadata&.dig("parsed_sections")
        if cached.is_a?(Array) && cached.any?
          @sections = cached.map(&:deep_symbolize_keys)
        else
          @sections = ContentEngine::LessonSectionParser.call(
            @content.body,
            metadata: @step.metadata || {},
            audio_url: @content.audio_url
          )
        end
        @rendered_html = ContentEngine::MarkdownRenderer.render(@content.body)
      end

      # If text content exists but audio hasn't been generated, trigger on-demand
      if @content.needs_audio?
        begin
          ContentEngine::AudioGenerationJob.perform_later(@step.id)
          @content.mark_audio_generating!
        rescue => e
          Rails.logger.error("Audio generation failed for step ##{@step.id}: #{e.message}")
        end
      end
    end

    def award_lesson_xp!
      return unless @step.content_type == "lesson"

      quiz_results = params[:quiz_results]
      all_correct = quiz_results.present? &&
                    quiz_results[:correct].to_i > 0 &&
                    quiz_results[:correct].to_i == quiz_results[:total].to_i

      source = all_correct ? "lesson_perfect" : "lesson_complete"
      amount = XpService::XP_VALUES[source.to_sym] || 10

      XpService.award(current_user, amount, source, source_id: @step.id.to_s)
      amount
    rescue => e
      Rails.logger.warn("[StepsController] Lesson XP award failed: #{e.message}")
      nil
    end

    def find_or_start_study_session
      Analytics::StudySession.for_user(current_user)
        .active
        .find_or_create_by!(route_step_id: @step.id) do |session|
          session.learning_route = @route
          session.started_at = Time.current
        end
    rescue ActiveRecord::RecordNotUnique
      retry
    end

    def finish_study_session!
      Analytics::StudySession.for_user(current_user)
        .active
        .where(route_step_id: @step.id)
        .find_each(&:finish!)
    end
  end
end
