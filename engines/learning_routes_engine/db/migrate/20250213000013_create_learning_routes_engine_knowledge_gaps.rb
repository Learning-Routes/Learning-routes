class CreateLearningRoutesEngineKnowledgeGaps < ActiveRecord::Migration[8.1]
  def change
    create_table :learning_routes_engine_knowledge_gaps, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, index: true
      t.references :learning_route, null: false, type: :uuid, index: true,
                   foreign_key: { to_table: :learning_routes_engine_learning_routes }
      t.string :topic, null: false
      t.text :description
      t.integer :severity, default: 0, null: false
      t.string :identified_from
      t.boolean :resolved, default: false, null: false

      t.timestamps
    end

    add_index :learning_routes_engine_knowledge_gaps, :severity
    add_index :learning_routes_engine_knowledge_gaps, :resolved
  end
end
