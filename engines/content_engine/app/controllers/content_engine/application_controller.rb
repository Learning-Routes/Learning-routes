module ContentEngine
  class ApplicationController < ::Core::ApplicationController
    private

    def authorize_route_step_access!(step_id)
      return true if LearningRoutesEngine::ModuleAccessPolicy.allowed_step?(
        user: current_user, step_id: step_id
      )

      head :forbidden
      false
    end

    # For actions that ENQUEUE AI work rather than read what already exists.
    # Read access survives a refund; spending does not.
    def authorize_route_step_generation!(step_id)
      return true if LearningRoutesEngine::ModuleAccessPolicy.generation_allowed?(
        user: current_user, step_id: step_id
      )

      head :forbidden
      false
    end
  end
end
