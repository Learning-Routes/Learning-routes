module LearningRoutesEngine
  class ReinforcementJob < ApplicationJob
    queue_as :default

    def perform(route_id)
      route = LearningRoute.find(route_id)
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
