module Admin
  class RoutesController < BaseController
    def show
      @detail = RouteDetailQuery.call(route_id: params[:id], page: params[:page])
    end
  end
end
