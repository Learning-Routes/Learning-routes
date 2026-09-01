# frozen_string_literal: true

module LearningRoutesEngine
  class ModuleAccessPolicy
    def self.allowed?(user:, route_id:, step_id:)
      return false unless user && !user.owner?

      RouteStep.joins(:route_module, learning_route: :learning_profile)
        .where(id: step_id, learning_route_id: route_id)
        .where(learning_routes_engine_learning_profiles: { user_id: user.id })
        .where(learning_routes_engine_route_modules: { access_state: :preview })
        .exists?
    end

    def self.allowed_step?(user:, step_id:)
      return false unless user && !user.owner?

      RouteStep.joins(:route_module, learning_route: :learning_profile)
        .where(id: step_id)
        .where(learning_routes_engine_learning_profiles: { user_id: user.id })
        .where(learning_routes_engine_route_modules: { access_state: :preview })
        .exists?
    end

    def self.cache_key(user:, step:)
      route_module = RouteModule.find(step.route_module_id)
      ["route-content-v1", user.id, step.learning_route_id, route_module.id,
       route_module.access_state, route_module.updated_at.to_i, step.id, step.updated_at.to_i]
    end
  end
end
