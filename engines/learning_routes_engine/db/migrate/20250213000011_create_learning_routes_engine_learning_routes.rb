class CreateLearningRoutesEngineLearningRoutes < ActiveRecord::Migration[8.1]
  def change
    create_table :learning_routes_engine_learning_routes, id: :uuid do |t|
      t.references :learning_profile, null: false, type: :uuid, index: true,
                   foreign_key: { to_table: :learning_routes_engine_learning_profiles }
      t.string :topic, null: false
      t.string :subject_area
      t.integer :status, default: 0, null: false
      t.integer :current_step, default: 0
      t.integer :total_steps, default: 0
      t.jsonb :difficulty_progression, default: {}
      t.string :ai_model_used

      t.timestamps
    end

    add_index :learning_routes_engine_learning_routes, :status
    add_index :learning_routes_engine_learning_routes, :topic
  end
end
