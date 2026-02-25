module ContentEngine
  class LessonsController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    def explain_differently
      ai_interaction_action(:explain_differently)
    end

    def give_example
      ai_interaction_action(:give_example)
    end

    def simplify
      ai_interaction_action(:simplify_content)
    end

    def deepen
      ai_interaction_action(:lesson_content)
    end

    private

    def set_step_and_authorize!
      @step = LearningRoutesEngine::RouteStep.find(params[:id])
      route = @step.learning_route
      unless route.learning_profile.user_id == current_user.id
        head :forbidden
      end
    end

    def ai_interaction_action(task_type)
      existing_content = AiContent.where(route_step: @step).by_type(:text).first
      route = @step.learning_route
      profile = route.learning_profile

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: task_type,
        variables: {
          topic: @step.title,
          description: @step.description.to_s,
          existing_content: existing_content&.body.to_s.truncate(4000),
          level: profile.current_level,
          learning_style: Array(profile.learning_style).join(", "),
          route_topic: route.topic,
          module_name: @step.title
        },
        user: current_user,
        async: false
      )

      if interaction.completed?
        @supplementary = AiContent.create!(
          route_step: @step,
          content_type: :explanation,
          body: interaction.response,
          ai_model: interaction.model
        )
        @rendered_html = MarkdownRenderer.render(interaction.response)
      else
        @error = t("flash.ai_generation_failed")
      end

      respond_to do |format|
        format.turbo_stream
        format.html { redirect_to learning_routes_engine.route_step_path(route, @step) }
      end
    end
  end
end
