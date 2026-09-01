module Admin
  class UserIndexQuery
    PER_PAGE = 25
    MAX_PER_PAGE = 100
    Result = Data.define(:rows, :page, :per_page, :total_count)
    Row = Data.define(:id, :name, :email, :registered_at, :last_active_at, :route_count,
      :completed_steps, :total_steps, :cost_microcents, :unpriced_interactions, :purchase_ready)

    ACTIVITY_FILTERS = %w[active inactive].freeze
    ROUTE_STATES = LearningRoutesEngine::LearningRoute.statuses.freeze

    def initialize(search: nil, activity: nil, route_state: nil, page: 1, per_page: PER_PAGE, **)
      @search = search.to_s.strip
      @activity = ACTIVITY_FILTERS.include?(activity.to_s) ? activity.to_s : nil
      @route_state = ROUTE_STATES.key?(route_state.to_s) ? route_state.to_s : nil
      @page = [page.to_i, 1].max
      @per_page = per_page.to_i.clamp(1, MAX_PER_PAGE)
    end

    def call
      pattern = "%#{ActiveRecord::Base.sanitize_sql_like(@search)}%"
      conditions = []
      conditions << "(u.name ILIKE :pattern OR u.email ILIKE :pattern)" if @search.present?
      conditions << (@activity == "active" ? "sessions.last_active_at >= :active_since" : "(sessions.last_active_at IS NULL OR sessions.last_active_at < :active_since)") if @activity
      conditions << "EXISTS (SELECT 1 FROM learning_routes_engine_learning_profiles fp JOIN learning_routes_engine_learning_routes fr ON fr.learning_profile_id = fp.id WHERE fp.user_id = u.id AND fr.status = :route_status)" if @route_state
      where_sql = conditions.any? ? "AND #{conditions.join(' AND ')}" : ""
      binds = { pattern: pattern, active_since: 30.days.ago, route_status: ROUTE_STATES[@route_state], limit: @per_page, offset: (@page - 1) * @per_page }
      sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL, binds])
        SELECT u.id, u.name, u.email, u.created_at AS registered_at,
          sessions.last_active_at,
          COALESCE(routes.route_count, 0) AS route_count,
          COALESCE(routes.completed_steps, 0) AS completed_steps,
          COALESCE(routes.total_steps, 0) AS total_steps,
          COALESCE(costs.cost_microcents, 0) AS cost_microcents,
          COALESCE(costs.unpriced_interactions, 0) AS unpriced_interactions,
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
          SELECT user_id,
            COALESCE(SUM(cost_microcents) FILTER (WHERE pricing_status = 'priced'), 0) AS cost_microcents,
            COUNT(*) FILTER (WHERE pricing_status = 'unpriced') AS unpriced_interactions
          FROM ai_orchestrator_ai_interactions
          WHERE status = 2 AND cached IS NOT TRUE
          GROUP BY user_id
        ) costs ON costs.user_id = u.id
        WHERE 1=1 #{where_sql}
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT :limit OFFSET :offset
      SQL
      records = Core::User.find_by_sql(sql)
      rows = records.map do |record|
        Row.new(id: record.id, name: record.name, email: record.email,
          registered_at: record.registered_at, last_active_at: record.last_active_at,
          route_count: record.route_count.to_i, completed_steps: record.completed_steps.to_i,
          total_steps: record.total_steps.to_i, cost_microcents: record.cost_microcents.to_i,
          unpriced_interactions: record.unpriced_interactions.to_i,
          purchase_ready: ActiveModel::Type::Boolean.new.cast(record.purchase_ready))
      end
      count_sql = ActiveRecord::Base.sanitize_sql_array(["SELECT COUNT(*) FROM core_users u LEFT JOIN (SELECT user_id, MAX(last_active_at) AS last_active_at FROM core_sessions GROUP BY user_id) sessions ON sessions.user_id = u.id WHERE 1=1 #{where_sql}", binds])
      total = Core::User.connection.select_value(count_sql).to_i
      Result.new(rows: rows, page: @page, per_page: @per_page, total_count: total)
    end
  end
end
