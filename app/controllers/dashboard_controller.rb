class DashboardController < ApplicationController
  before_action :authenticate_user!

  def show
    @profile = LearningRoutesEngine::LearningProfile.find_by(user: current_user)
    @routes = @profile&.learning_routes&.includes(:route_steps)&.order(updated_at: :desc) || []
  end
end
