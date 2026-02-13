class CreateLearningRoutesEngineRouteSteps < ActiveRecord::Migration[8.1]
  def change
    create_table :learning_routes_engine_route_steps, id: :uuid do |t|
      t.references :learning_route, null: false, type: :uuid, index: true,
                   foreign_key: { to_table: :learning_routes_engine_learning_routes }
      t.integer :position, null: false
      t.string :title, null: false
      t.text :description
      t.integer :level, default: 0, null: false
      t.integer :content_type, default: 0, null: false
      t.integer :status, default: 0, null: false
      t.integer :estimated_minutes
      t.datetime :completed_at
      t.integer :bloom_level

      t.timestamps
    end

    add_index :learning_routes_engine_route_steps, [:learning_route_id, :position],
              unique: true, name: "idx_route_steps_on_route_and_position"
    add_index :learning_routes_engine_route_steps, :status
    add_index :learning_routes_engine_route_steps, :level
  end
end
