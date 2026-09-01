module Admin
  class DashboardSummaryQuery
    Result = Data.define(:registered_users, :routes, :cost_microcents, :commerce_available)

    def self.call
      row = ActiveRecord::Base.connection.select_one(<<~SQL)
        SELECT
          (SELECT COUNT(*) FROM core_users) AS registered_users,
          (SELECT COUNT(*) FROM learning_routes_engine_learning_routes) AS routes,
          (SELECT COALESCE(SUM(cost_microcents), 0) FROM ai_orchestrator_ai_interactions
            WHERE status = 2 AND cached = false AND pricing_status = 'priced') AS cost_microcents
      SQL
      Result.new(registered_users: row["registered_users"].to_i, routes: row["routes"].to_i,
        cost_microcents: row["cost_microcents"].to_i, commerce_available: false)
    end
  end
end
