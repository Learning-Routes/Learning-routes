module LearningRoutesEngine
  class RoutesController < ApplicationController
    before_action :authenticate_user!
    before_action :set_route
    before_action :authorize_route_owner!

    def show
      @steps = @route.route_steps.order(:position)
      @progress = RouteProgressTracker.new(@route).progress_summary
      @due_reviews = SpacedRepetition.new.due_reviews(@route)
    end

    private

    def set_route
      @route = LearningRoute.find(params[:id])
    end

    def authorize_route_owner!
      unless @route.learning_profile.user_id == current_user.id
        redirect_to main_app.dashboard_path, alert: "Not authorized."
      end
    end
  end
end
