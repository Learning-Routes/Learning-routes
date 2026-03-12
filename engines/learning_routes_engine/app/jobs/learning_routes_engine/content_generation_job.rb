module LearningRoutesEngine
  class ContentGenerationJob < ApplicationJob
    queue_as :default
    retry_on StandardError, wait: :polynomially_longer, attempts: 3

    def perform(route_step_id)
      step = RouteStep.find(route_step_id)
      return if ContentEngine::AiContent.where(route_step: step).by_type(:text).exists?

      route = step.learning_route
      profile = route.learning_profile

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :lesson_content,
        variables: {
          topic: step.localized_title,
          description: step.localized_description.to_s,
          level: profile.current_level,
          learning_style: Array(profile.learning_style).join(", "),
          bloom_level: step.bloom_level.to_s,
          route_topic: route.localized_topic,
          locale: route.locale || profile.user.locale || "en"
        },
        user: profile.user,
        async: false
      )

      if interaction.completed?
        body = extract_markdown(interaction.response)

        ActiveRecord::Base.transaction do
          content = ContentEngine::AiContent.create!(
            route_step: step,
            content_type: :text,
            body: body,
            ai_model: interaction.model,
            metadata: {
              learning_route_id: route.id,
              ai_interaction_id: interaction.id,
              bloom_level: step.bloom_level
            }
          )

          # Pre-parse and cache sections so we don't re-parse on every page load
          parsed_sections = ContentEngine::LessonSectionParser.call(
            body,
            metadata: step.metadata || {},
            audio_url: content.audio_url
          )

          step.update!(metadata: step.metadata.merge(
            content_generated: true,
            parsed_sections: parsed_sections.map(&:as_json)
          ))
        end

        Rails.logger.info("[ContentGenerationJob] Content generated for step #{route_step_id}")

        # Generate step quiz for lesson/exercise steps (enqueued after transaction commits)
        if step.requires_quiz?
          StepQuizGenerationJob.perform_later(route_step_id)
        end
      else
        Rails.logger.error("[ContentGenerationJob] AI failed for step #{route_step_id}: #{interaction.status}")
      end
    end

    private

    # AI may return JSON with a "content" key or plain markdown.
    # Handles: raw JSON, JSON wrapped in ```json fences, or plain markdown.
    def extract_markdown(raw)
      # Strip markdown code fence wrapper if present
      stripped = raw.gsub(/\A\s*```\w*\s*\n?/, "").gsub(/\n?\s*```\s*\z/, "").strip

      parsed = JSON.parse(stripped)
      parsed["content"] || parsed.values.find { |v| v.is_a?(String) && v.length > 100 } || raw
    rescue JSON::ParserError
      raw
    end
  end
end
