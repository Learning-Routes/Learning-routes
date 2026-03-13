module LearningRoutesEngine
  class BackgroundContentGenerationJob < ApplicationJob
    queue_as :low_priority

    retry_on StandardError, wait: 30.seconds, attempts: 2

    DELAY_BETWEEN_STEPS = 5.seconds

    def perform(route_id, options = {})
      route = LearningRoute.find(route_id)

      steps_needing_content = route.route_steps
        .where.not(content_type: :assessment)
        .order(:position)
        .reject { |step| step.metadata&.dig("content_ready") }

      return if steps_needing_content.empty?

      Rails.logger.info("[BackgroundContentGeneration] Scheduling content for #{steps_needing_content.size} steps in route #{route_id}")

      steps_needing_content.each_with_index do |step, index|
        delay = DELAY_BETWEEN_STEPS * index

        if delay.zero?
          ContentPipelineJob.perform_later(step.id, options)
        else
          ContentPipelineJob.set(wait: delay).perform_later(step.id, options)
        end
      end
    end
  end
end
