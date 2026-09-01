module LearningRoutesEngine
  class RouteGenerationJob < ApplicationJob
    queue_as :default
    retry_on StandardError, wait: :polynomially_longer, attempts: 3

    def perform(learning_profile_id)
      profile = LearningProfile.find(learning_profile_id)

      route = RouteGenerator.new(profile).generate!

      preview = RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
      RouteStep.where(route_module_id: preview.id).order(:position).each do |step|
        next if step.content_type_assessment?

        ContentGenerationJob.perform_later(step.id)
      end

      # Pre-generate assessments
      RouteStep.where(route_module_id: preview.id, content_type: :assessment).find_each do |step|
        AssessmentGenerationJob.perform_later(step.id)
      end

      Rails.logger.info("[RouteGenerationJob] Route generated for profile #{learning_profile_id}: #{route.route_steps.count} steps")
    rescue RouteGenerator::GenerationError => e
      Rails.logger.error("[RouteGenerationJob] Generation failed for profile #{learning_profile_id}: #{e.message}")
      raise # Re-raise for Solid Queue retry
    end
  end
end
