class CreateLearningRoutesEngineReinforcementRoutes < ActiveRecord::Migration[8.1]
  def change
    create_table :learning_routes_engine_reinforcement_routes, id: :uuid do |t|
      t.references :learning_route, null: false, type: :uuid, index: true,
                   foreign_key: { to_table: :learning_routes_engine_learning_routes }
      t.references :knowledge_gap, null: false, type: :uuid, index: true,
                   foreign_key: { to_table: :learning_routes_engine_knowledge_gaps }
      t.integer :status, default: 0, null: false
      t.jsonb :steps, default: []

      t.timestamps
    end

    add_index :learning_routes_engine_reinforcement_routes, :status
  end
end
