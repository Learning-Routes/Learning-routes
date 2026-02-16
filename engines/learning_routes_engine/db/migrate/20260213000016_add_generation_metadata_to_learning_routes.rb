class AddGenerationMetadataToLearningRoutes < ActiveRecord::Migration[8.1]
  def change
    change_table :learning_routes_engine_learning_routes do |t|
      t.jsonb :generation_params, default: {}
      t.string :generation_status
      t.datetime :generated_at
      t.uuid :ai_interaction_id
    end

    add_index :learning_routes_engine_learning_routes, :generation_status,
              name: "idx_learning_routes_on_generation_status"
    add_index :learning_routes_engine_learning_routes, :ai_interaction_id,
              name: "idx_learning_routes_on_ai_interaction"
  end
end
