module LearningRoutesEngine
  class ReinforcementJob < ApplicationJob
    queue_as :default
    retry_on StandardError, wait: :polynomially_longer, attempts: 3

    def perform(route_id)
      # `ReinforcementGenerator#initialize` reads `route.learning_profile.user` and
      # `route.learning_profile` (reinforcement_generator.rb:10-11). Same preload, and
      # the same per-environment behaviour, as gap_analysis_job.rb.
      route = LearningRoute.includes(learning_profile: :user).find(route_id)
      unresolved_gaps = route.knowledge_gaps.unresolved

      if unresolved_gaps.none?
        Rails.logger.info("[ReinforcementJob] No unresolved gaps for route #{route_id}")
        return
      end

      generator = ReinforcementGenerator.new(
        knowledge_gaps: unresolved_gaps,
        route: route
      )

      reinforcement_routes = generator.generate!
      Rails.logger.info("[ReinforcementJob] Generated #{reinforcement_routes.size} reinforcement routes for route #{route_id}")
    end
  end
end
