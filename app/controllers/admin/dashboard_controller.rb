module Admin
  class DashboardController < BaseController
    def show
      @summary = DashboardSummaryQuery.call
    end
  end
end
