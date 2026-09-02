module LearningRoutesEngine
  class ReviewsController < ApplicationController
    before_action :authenticate_user!

    layout "learning"

    def index
      profile = LearningProfile.find_by(user: current_user)
      @due_reviews = []

      if profile
        route_ids = profile.learning_routes.active_routes.pluck(:id)
        if route_ids.any?
          due_steps = RouteStep
            .where(learning_route_id: route_ids)
            .joins(:route_module)
            .where(learning_routes_engine_route_modules: { access_state: :preview })
            .due_for_review
            .includes(:learning_route)
            .order(:fsrs_next_review_at)

          due_steps.each do |step|
            @due_reviews << { step: step, route: step.learning_route }
          end
        end
      end
    end

    def submit_review
      unless ModuleAccessPolicy.allowed_step?(user: current_user, step_id: params[:id])
        return head :forbidden
      end

      @step = RouteStep.find(params[:id])
      route = @step.learning_route

      rating = params[:rating].to_i
      unless rating.between?(1, 4)
        redirect_to reviews_path, alert: t("flash.invalid_rating")
        return
      end

      tracker = RouteProgressTracker.new(route)
      tracker.record_review!(@step, rating)

      respond_to do |format|
        format.html { redirect_to reviews_path, notice: t("flash.review_recorded") }
        format.turbo_stream
      end
    end
  end
end
