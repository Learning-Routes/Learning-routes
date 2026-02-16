module ContentEngine
  class ExercisesController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    def submit_answer
      route = @step.learning_route
      profile = route.learning_profile

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :quick_grading,
        variables: {
          question: @step.description.to_s,
          expected_answer: exercise_content&.body.to_s.truncate(2000),
          student_answer: params[:answer],
          topic: @step.title
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
        @error = "Grading failed. Please try again."
      end

      respond_to do |format|
        format.turbo_stream
        format.html { redirect_to learning_routes_engine.route_step_path(route, @step) }
      end
    end

    def get_hint
      route = @step.learning_route
      profile = route.learning_profile

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :exercise_hint,
        variables: {
          topic: @step.title,
          exercise_description: @step.description.to_s,
          exercise_content: exercise_content&.body.to_s.truncate(3000),
          level: profile.current_level,
          hint_number: (hint_count + 1).to_s
        },
        user: current_user,
        async: false
      )

      if interaction.completed?
        @hint = interaction.response
        @rendered_hint = MarkdownRenderer.render(@hint)
        increment_hint_count!
      else
        @error = "Could not generate hint."
      end

      respond_to do |format|
        format.turbo_stream
        format.html { redirect_to learning_routes_engine.route_step_path(route, @step) }
      end
    end

    def run_code
      @output = "Code sandbox coming soon. Your code has been saved."
      respond_to do |format|
        format.turbo_stream
        format.json { render json: { output: @output, status: "placeholder" } }
      end
    end

    private

    def set_step_and_authorize!
      @step = LearningRoutesEngine::RouteStep.find(params[:id])
      route = @step.learning_route
      unless route.learning_profile.user_id == current_user.id
        head :forbidden
      end
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
