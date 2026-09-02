# frozen_string_literal: true

module Commerce
  class CheckoutsController < ApplicationController
    before_action :authenticate_user!

    def create
      route = LearningRoutesEngine::LearningRoute.includes(:learning_profile).find_by(id: params[:route_id])
      # A route the caller does not own must be indistinguishable from one that
      # does not exist.
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
