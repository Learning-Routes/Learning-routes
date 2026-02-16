module LearningRoutesEngine
  class RouteGenerationJob < ApplicationJob
    queue_as :default

    def perform(learning_profile_id)
      profile = LearningProfile.find(learning_profile_id)

      route = RouteGenerator.new(profile).generate!

      # Pre-generate content for the first 3 steps
      route.route_steps.order(:position).limit(3).each do |step|
        next if step.content_type_assessment?

        ContentGenerationJob.perform_later(step.id)
      end

      # Pre-generate assessments
      route.route_steps.where(content_type: :assessment).find_each do |step|
        AssessmentGenerationJob.perform_later(step.id)
      end

      Rails.logger.info("[RouteGenerationJob] Route generated for profile #{learning_profile_id}: #{route.route_steps.count} steps")
    rescue RouteGenerator::GenerationError => e
      Rails.logger.error("[RouteGenerationJob] Generation failed for profile #{learning_profile_id}: #{e.message}")
      raise # Re-raise for Solid Queue retry
    end
  end
end
