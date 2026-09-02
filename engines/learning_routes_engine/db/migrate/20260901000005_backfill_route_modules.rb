# frozen_string_literal: true

class BackfillRouteModules < ActiveRecord::Migration[8.1]
  STEPS = :learning_routes_engine_route_steps

  def up
    say_with_time "Backfilling deterministic route modules" do
      LearningRoutesEngine::LearningRoute.find_each do |route|
        LearningRoutesEngine::LegacyModuleBackfill.call(route)
      end
    end

    remaining = LearningRoutesEngine::RouteStep.where(route_module_id: nil).count
    raise ActiveRecord::MigrationError, "#{remaining} route steps remain without modules" if remaining.positive?

    change_column_null STEPS, :route_module_id, false
  end

  def down
    # Compatibility rollback: legacy level data remains authoritative. The earlier
    # expansion migration owns removal of the reference and module table.
    change_column_null STEPS, :route_module_id, true
  end
end
