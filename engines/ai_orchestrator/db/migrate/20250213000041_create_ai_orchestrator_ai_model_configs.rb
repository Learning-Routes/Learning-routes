class CreateAiOrchestratorAiModelConfigs < ActiveRecord::Migration[8.1]
  def change
    create_table :ai_orchestrator_ai_model_configs, id: :uuid do |t|
      t.string :model_name, null: false
      t.string :task_type, null: false
      t.integer :priority, default: 0, null: false
      t.string :fallback_model
      t.integer :rate_limit
      t.boolean :enabled, default: true, null: false

      t.timestamps
    end

    add_index :ai_orchestrator_ai_model_configs, [:task_type, :priority],
              name: "idx_model_configs_on_task_and_priority"
    add_index :ai_orchestrator_ai_model_configs, :model_name
    add_index :ai_orchestrator_ai_model_configs, :enabled
  end
end
