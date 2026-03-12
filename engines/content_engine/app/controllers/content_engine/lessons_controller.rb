module ContentEngine
  class LessonsController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    def explain_differently
      ai_interaction_action(:explain_differently)
    end

    def give_example
      ai_interaction_action(:give_example, generate_image: true)
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
      unless route.learning_profile&.user_id == current_user.id
        head :forbidden
        return
      end
    end

    def ai_interaction_action(task_type, generate_image: false)
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

        # Generate an illustrative image alongside the example
        if generate_image
          @image_url = generate_example_image(route.topic, @step.title, interaction.response)
        end
      else
        @error = t("flash.ai_generation_failed")
      end

      respond_to do |format|
        format.turbo_stream
        format.html { redirect_to learning_routes_engine.route_step_path(route, @step) }
      end
    end

    def generate_example_image(route_topic, step_title, example_text)
      # Build a concise image prompt from the example context
      image_prompt = "Educational illustration for learning #{route_topic}: #{step_title}. " \
                     "Clean, modern flat design with soft colors. " \
                     "Concept visualization, no text in image."

      begin
        router = AiOrchestrator::ModelRouter.new(task_type: :quick_images, user: current_user)
        result = router.execute do |model, _params|
          client = AiOrchestrator::AiClient.new(model: model, task_type: :quick_images, user: current_user)
          client.chat(prompt: image_prompt, params: { width: 768, height: 512 })
        end

        result[:content] if result[:content].present?
      rescue => e
        Rails.logger.warn("[LessonsController] Image generation failed: #{e.message}")
        nil
      end
    end
  end
end
