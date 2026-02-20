module LearningRoutesEngine
  class ContentGenerationJob < ApplicationJob
    queue_as :default

    def perform(route_step_id)
      step = RouteStep.find(route_step_id)
      route = step.learning_route
      profile = route.learning_profile

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :lesson_content,
        variables: {
          topic: step.title,
          description: step.description.to_s,
          level: profile.current_level,
          learning_style: Array(profile.learning_style).join(", "),
          bloom_level: step.bloom_level.to_s,
          route_topic: route.topic
        },
        user: profile.user,
        async: false
      )

      if interaction.completed?
        ContentEngine::AiContent.create!(
          route_step: step,
          content_type: :text,
          body: interaction.response,
          ai_model: interaction.model,
          metadata: {
            learning_route_id: route.id,
            ai_interaction_id: interaction.id,
            bloom_level: step.bloom_level
          }
        )

        step.update!(metadata: step.metadata.merge(content_generated: true))
        Rails.logger.info("[ContentGenerationJob] Content generated for step #{route_step_id}")

        # Generate step quiz for lesson/exercise steps
        if step.requires_quiz?
          StepQuizGenerationJob.perform_later(route_step_id)
        end
      else
        Rails.logger.error("[ContentGenerationJob] AI failed for step #{route_step_id}: #{interaction.status}")
      end
    end
  end
end
