module Admin
  class UserIndexQuery
    PER_PAGE = 25
    MAX_PER_PAGE = 100
    Result = Data.define(:rows, :page, :per_page, :total_count)
    Row = Data.define(:id, :name, :email, :registered_at, :last_active_at, :route_count,
      :completed_steps, :total_steps, :cost_microcents, :purchase_ready)

    def initialize(search: nil, page: 1, per_page: PER_PAGE, **)
      @search = search.to_s.strip
      @page = [page.to_i, 1].max
      @per_page = per_page.to_i.clamp(1, MAX_PER_PAGE)
    end

    def call
      pattern = "%#{ActiveRecord::Base.sanitize_sql_like(@search)}%"
      condition = @search.present? ? "AND (u.name ILIKE :pattern OR u.email ILIKE :pattern)" : ""
      sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL, { pattern: pattern, limit: @per_page, offset: (@page - 1) * @per_page }])
        SELECT u.id, u.name, u.email, u.created_at AS registered_at,
          sessions.last_active_at,
          COALESCE(routes.route_count, 0) AS route_count,
          COALESCE(routes.completed_steps, 0) AS completed_steps,
          COALESCE(routes.total_steps, 0) AS total_steps,
          COALESCE(costs.cost_microcents, 0) AS cost_microcents,
          COALESCE(routes.purchase_ready, false) AS purchase_ready
        FROM core_users u
        LEFT JOIN (
          SELECT user_id, MAX(last_active_at) AS last_active_at FROM core_sessions GROUP BY user_id
        ) sessions ON sessions.user_id = u.id
        LEFT JOIN (
          SELECT p.user_id, COUNT(DISTINCT r.id) AS route_count,
            COUNT(s.id) FILTER (WHERE s.status = 3) AS completed_steps,
            COUNT(s.id) AS total_steps,
            BOOL_OR(r.generation_status = 'completed') AS purchase_ready
          FROM learning_routes_engine_learning_profiles p
          JOIN learning_routes_engine_learning_routes r ON r.learning_profile_id = p.id
          LEFT JOIN learning_routes_engine_route_steps s ON s.learning_route_id = r.id
          GROUP BY p.user_id
        ) routes ON routes.user_id = u.id
        LEFT JOIN (
          SELECT user_id, SUM(cost_microcents) AS cost_microcents
          FROM ai_orchestrator_ai_interactions
          WHERE status = 2 AND cached = false AND pricing_status = 'priced'
          GROUP BY user_id
        ) costs ON costs.user_id = u.id
        WHERE 1=1 #{condition}
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT :limit OFFSET :offset
      SQL
      records = Core::User.find_by_sql(sql)
      rows = records.map do |record|
        Row.new(id: record.id, name: record.name, email: record.email,
          registered_at: record.registered_at, last_active_at: record.last_active_at,
          route_count: record.route_count.to_i, completed_steps: record.completed_steps.to_i,
          total_steps: record.total_steps.to_i, cost_microcents: record.cost_microcents.to_i,
          purchase_ready: ActiveModel::Type::Boolean.new.cast(record.purchase_ready))
      end
      count_scope = Core::User.all
      count_scope = count_scope.where("name ILIKE :q OR email ILIKE :q", q: pattern) if @search.present?
      Result.new(rows: rows, page: @page, per_page: @per_page, total_count: count_scope.count)
    end
  end
end
