module LearningRoutesEngine
  class ReviewsController < ApplicationController
    before_action :authenticate_user!

    layout "learning"

    def index
      profile = LearningProfile.find_by(user: current_user)
      @due_reviews = []

      profile&.learning_routes&.includes(:route_steps)&.active_routes&.each do |route|
        sr = SpacedRepetition.new
        sr.due_reviews(route).each do |step|
          @due_reviews << { step: step, route: route }
        end
      end

      @due_reviews.sort_by! { |r| r[:step].fsrs_next_review_at || Time.current }
    end

    def submit_review
      @step = RouteStep.find(params[:id])
      route = @step.learning_route

      unless route.learning_profile.user_id == current_user.id
        redirect_to main_app.dashboard_path, alert: t("flash.not_authorized")
        return
      end

      rating = params[:rating].to_i
      unless rating.between?(1, 5)
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
