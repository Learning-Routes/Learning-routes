module CommunityEngine
  class SharedRoutesController < ApplicationController
    skip_before_action :authenticate_user!, only: [:show]

    def create
      route = current_user.learning_profile&.learning_routes&.find_by(id: params[:learning_route_id])
      return head(:forbidden) unless route

      @shared_route = RouteSharer.share!(route, current_user, visibility: params[:visibility] || "public", description: params[:description])

      ActivityTracker.track!(user: current_user, action: "shared", trackable: @shared_route)

      respond_to do |format|
        format.turbo_stream
        format.json { render json: { share_token: @shared_route.share_token, share_url: @shared_route.share_url } }
        format.html { redirect_back(fallback_location: root_path, notice: t("community_engine.shared_routes.shared")) }
      end
    end

    def show
      @shared_route = SharedRoute.find_by!(share_token: params[:id])
      @route = @shared_route.learning_route
      @steps = @route.route_steps.order(:position)
      @comments = @shared_route.comments.top_level.includes(:user, replies: :user).recent
    end

    def clone
      shared_route = SharedRoute.find(params[:id])

      # Only allow cloning public/unlisted shared routes
      unless shared_route.visibility.in?(%w[public unlisted])
        return head(:forbidden)
      end

      new_route = RouteSharer.clone!(shared_route, current_user)

      ActivityTracker.track!(user: current_user, action: "cloned_route", trackable: shared_route)

      redirect_to learning_routes_engine.route_path(new_route), notice: t("community_engine.shared_routes.cloned")
    end

    def destroy
      shared_route = current_user.shared_routes.find(params[:id])
      RouteSharer.unshare!(shared_route)
      redirect_back(fallback_location: root_path, notice: t("community_engine.shared_routes.unshared"))
    end
  end
end
