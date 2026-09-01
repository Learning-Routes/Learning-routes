module Admin
  class RouteDetailQuery
    PER_PAGE = 25
    MAX_PER_PAGE = 100
    Result = Data.define(:route, :user, :modules, :page, :per_page, :total_count, :quote)
    ModuleRow = Data.define(:id, :position, :title, :description, :access_state,
      :generation_state, :step_count, :preview)

    def self.call(route_id:, page: 1, per_page: PER_PAGE)
      page = [page.to_i, 1].max
      per_page = per_page.to_i.clamp(1, MAX_PER_PAGE)
      route = LearningRoutesEngine::LearningRoute
        .eager_load(learning_profile: :user).find(route_id)
      records = route.route_modules.reorder(:position, :id)
        .left_joins(:route_steps).select("learning_routes_engine_route_modules.*, COUNT(learning_routes_engine_route_steps.id) AS step_count")
        .group("learning_routes_engine_route_modules.id")
        .limit(per_page).offset((page - 1) * per_page)
      modules = records.map do |record|
        ModuleRow.new(id: record.id, position: record.position, title: record.title,
          description: record.description, access_state: record.access_state,
          generation_state: record.generation_state, step_count: record.step_count.to_i,
          preview: record.access_preview?)
      end
      quote = Commerce::RouteQuote.active.where(
        learning_route_id: route.id, user_id: route.learning_profile.user_id
      ).order(created_at: :desc, id: :desc).first
      Result.new(route: route, user: route.learning_profile.user, modules: modules,
        page: page, per_page: per_page, total_count: route.route_modules.count, quote: quote)
    end
  end
end
