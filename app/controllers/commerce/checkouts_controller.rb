# frozen_string_literal: true

module Commerce
  class CheckoutsController < ApplicationController
    before_action :authenticate_user!

    def create
      route = owned_route
      # A route the caller does not own must be indistinguishable from one that
      # does not exist — in the response AND in the work done to answer. Scoping
      # the lookup by ownership up front means a missing id and an unowned id
      # both resolve in this one query and neither reaches PaymentProvider.
      return head(:not_found) if route.nil?

      provider = PaymentProvider.resolve
      return reject("provider_unavailable") unless provider.available?

      result = CheckoutCreator.call(
        user: current_user, route: route, adapter: provider.adapter,
        success_url: purchase_return_url(route), cancel_url: route_url_for(route)
      )
      return reject(result.reason) unless result.created?

      redirect_to result.checkout_url, allow_other_host: true, status: :see_other
    end

    private

    # An explicit join/where, not a lazy association traversal — strict_loading
    # is on by default and this must resolve in one query regardless of whether
    # the route exists at all.
    def owned_route
      LearningRoutesEngine::LearningRoute
        .joins(:learning_profile)
        .where(learning_routes_engine_learning_profiles: { user_id: current_user.id })
        .find_by(id: params[:route_id])
    end

    def reject(reason)
      return head(:not_found) if reason == "not_owner"

      message = t("commerce.checkout.#{reason}", default: t("commerce.checkout.unavailable"))
      respond_to do |format|
        format.json { render json: { error: reason }, status: :unprocessable_entity }
        format.any  { redirect_back fallback_location: main_app.dashboard_path, alert: message, status: :see_other }
      end
    end

    def purchase_return_url(route)
      learning_routes_engine.route_url(route, purchase: "pending")
    end

    def route_url_for(route)
      learning_routes_engine.route_url(route)
    end
  end
end
