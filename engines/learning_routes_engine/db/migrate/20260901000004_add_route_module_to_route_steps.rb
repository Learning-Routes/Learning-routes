# frozen_string_literal: true

class AddRouteModuleToRouteSteps < ActiveRecord::Migration[8.1]
  STEPS = :learning_routes_engine_route_steps
  MODULES = :learning_routes_engine_route_modules
  CONSTRAINT = "fk_route_steps_module_same_route"

  def up
    add_column STEPS, :route_module_id, :uuid
    add_index STEPS, :route_module_id, name: "idx_route_steps_on_route_module"
    add_index MODULES, %i[id learning_route_id], unique: true,
              name: "idx_route_modules_id_and_route"

    execute <<~SQL
      ALTER TABLE learning_routes_engine_route_steps
      ADD CONSTRAINT #{CONSTRAINT}
      FOREIGN KEY (route_module_id, learning_route_id)
      REFERENCES learning_routes_engine_route_modules (id, learning_route_id)
      ON DELETE RESTRICT
      NOT VALID
    SQL
    execute "ALTER TABLE learning_routes_engine_route_steps VALIDATE CONSTRAINT #{CONSTRAINT}"
  end

  def down
    execute "ALTER TABLE learning_routes_engine_route_steps DROP CONSTRAINT IF EXISTS #{CONSTRAINT}"
    remove_index MODULES, name: "idx_route_modules_id_and_route"
    remove_index STEPS, name: "idx_route_steps_on_route_module"
    remove_column STEPS, :route_module_id
  end
end
