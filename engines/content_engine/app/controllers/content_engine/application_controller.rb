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
  end
end
