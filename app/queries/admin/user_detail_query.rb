module Admin
  class UserDetailQuery
    PER_PAGE = 25
    MAX_PER_PAGE = 100
    Result = Data.define(:user, :routes, :page, :per_page, :total_count, :commerce_available)
    UserRow = Data.define(:id, :name, :email, :registered_at, :last_active_at, :cost_microcents)
    RouteRow = Data.define(:id, :topic, :state, :generation_state, :created_at, :updated_at,
      :completed_steps, :total_steps, :cost_microcents, :purchase_ready)

    def self.call(user_id:, page: 1, per_page: PER_PAGE)
      user = Core::User.find(user_id)
      page = [page.to_i, 1].max
      per_page = per_page.to_i.clamp(1, MAX_PER_PAGE)
      last_active = Core::Session.where(user_id: user.id).maximum(:last_active_at)
      user_cost = AiOrchestrator::AiInteraction.billable.where(user_id: user.id).sum(:cost_microcents)
      user_row = UserRow.new(id: user.id, name: user.name, email: user.email,
        registered_at: user.created_at, last_active_at: last_active, cost_microcents: user_cost)
      binds = { user_id: user.id, limit: per_page, offset: (page - 1) * per_page }
      sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL, binds])
        SELECT r.id, r.topic, r.status, r.generation_status, r.created_at, r.updated_at,
          COUNT(s.id) FILTER (WHERE s.status = 3) AS completed_steps, COUNT(s.id) AS total_steps,
          COALESCE(MAX(costs.cost_microcents), 0) AS cost_microcents
        FROM learning_routes_engine_learning_routes r
        JOIN learning_routes_engine_learning_profiles p ON p.id = r.learning_profile_id
        LEFT JOIN learning_routes_engine_route_steps s ON s.learning_route_id = r.id
        LEFT JOIN (SELECT (metadata->>'route_id')::uuid AS route_id, SUM(cost_microcents) AS cost_microcents
          FROM ai_orchestrator_ai_interactions WHERE user_id = :user_id AND status = 2 AND cached = false
          AND pricing_status = 'priced' AND metadata ? 'route_id' GROUP BY metadata->>'route_id') costs ON costs.route_id = r.id
        WHERE p.user_id = :user_id GROUP BY r.id ORDER BY r.updated_at DESC, r.id DESC
        LIMIT :limit OFFSET :offset
      SQL
      routes = LearningRoutesEngine::LearningRoute.find_by_sql(sql).map do |route|
        RouteRow.new(id: route.id, topic: route.topic,
          state: LearningRoutesEngine::LearningRoute.statuses.key(route.status_before_type_cast.to_i),
          generation_state: route.generation_status, created_at: route.created_at, updated_at: route.updated_at,
          completed_steps: route.completed_steps.to_i, total_steps: route.total_steps.to_i,
          cost_microcents: route.cost_microcents.to_i,
          purchase_ready: route.generation_status == "completed" && route.total_steps.to_i.positive?)
      end
      count_sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL, binds])
        SELECT COUNT(*) FROM learning_routes_engine_learning_routes r
        JOIN learning_routes_engine_learning_profiles p ON p.id = r.learning_profile_id
        WHERE p.user_id = :user_id
      SQL
      total_count = LearningRoutesEngine::LearningRoute.connection.select_value(count_sql).to_i
      Result.new(user: user_row, routes: routes, page: page, per_page: per_page,
        total_count: total_count, commerce_available: false)
    end
  end
end
