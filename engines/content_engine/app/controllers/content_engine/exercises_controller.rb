module ContentEngine
  class ExercisesController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    def submit_answer
      route = @step.learning_route
      profile = route.learning_profile

      # Resolve from the ROUTE, not I18n.locale. I18n.locale is the browser's UI
      # preference; a student can read the interface in English while taking a course
      # taught in Spanish, and the feedback belongs to the course.
      locales = AiOrchestrator::LocaleResolver.for_route(route, user: current_user)
      content_locale = locales[:locale]

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :quick_grading,
        variables: {
          question: @step.localized_description(content_locale).to_s,
          expected_answer: exercise_content&.body.to_s.truncate(2000),
          student_answer: params[:answer],
          topic: @step.localized_title(content_locale),
          **locales
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
        @grading_result = parser.parse!
        store_exercise_submission!(params[:answer], @grading_result)
      else
        @error = t("flash.grading_failed")
      end

      respond_to do |format|
        format.turbo_stream
        format.html { redirect_to learning_routes_engine.route_step_path(route, @step) }
      end
    end

    def get_hint
      route = @step.learning_route
      profile = route.learning_profile

      locales = AiOrchestrator::LocaleResolver.for_route(route, user: current_user)
      content_locale = locales[:locale]

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :exercise_hint,
        variables: {
          topic: @step.localized_title(content_locale),
          exercise_description: @step.localized_description(content_locale).to_s,
          exercise_content: exercise_content&.body.to_s.truncate(3000),
          level: profile.current_level,
          hint_number: (hint_count + 1).to_s,
          **locales
        },
        user: current_user,
        async: false
      )

      if interaction.completed?
        @hint = interaction.response
        @rendered_hint = MarkdownRenderer.render(@hint)
        increment_hint_count!
      else
        @error = t("flash.hint_failed")
      end

      respond_to do |format|
        format.turbo_stream
        format.html { redirect_to learning_routes_engine.route_step_path(route, @step) }
      end
    end

    def run_code
      @output = t("flash.code_sandbox_placeholder")
      respond_to do |format|
        format.turbo_stream
        format.json { render json: { output: @output, status: "placeholder" } }
      end
    end

    private

    def set_step_and_authorize!
      return unless authorize_route_step_access!(params[:id])

      @step = LearningRoutesEngine::RouteStep.find(params[:id])
    end

    def exercise_content
      @exercise_content ||= AiContent.where(route_step: @step).by_type(:exercise).first ||
                            AiContent.where(route_step: @step).by_type(:text).first
    end

    def store_exercise_submission!(answer, grading)
      submissions = @step.metadata["submissions"] || []
      submissions << {
        "answer" => answer.to_s.truncate(5000),
        "score" => grading["score"],
        "feedback" => grading["feedback"],
        "submitted_at" => Time.current.iso8601
      }
      @step.update!(metadata: @step.metadata.merge("submissions" => submissions))
    end

    def hint_count
      (@step.metadata["hint_count"] || 0).to_i
    end

    def increment_hint_count!
      @step.update!(metadata: @step.metadata.merge("hint_count" => hint_count + 1))
    end
  end
end
