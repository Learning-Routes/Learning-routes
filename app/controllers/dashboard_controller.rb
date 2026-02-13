class DashboardController < Core::ApplicationController
  before_action :authenticate_user!
  before_action :require_onboarding

  def show
    @profile = LearningRoutesEngine::LearningProfile.find_by(user: current_user)
    @routes = @profile&.learning_routes&.order(updated_at: :desc) || []
  end

  private

  def require_onboarding
    redirect_to core.onboarding_path unless current_user.onboarding_completed?
  end
end
