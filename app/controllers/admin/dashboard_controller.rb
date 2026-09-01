module Admin
  class DashboardController < BaseController
    def show
      render plain: "Owner dashboard"
    end
  end
end
