class AddFieldsToAiOrchestratorAiInteractions < ActiveRecord::Migration[8.1]
  def change
    add_column :ai_orchestrator_ai_interactions, :task_type, :string
    add_column :ai_orchestrator_ai_interactions, :input_tokens, :integer, default: 0
    add_column :ai_orchestrator_ai_interactions, :output_tokens, :integer, default: 0
    add_column :ai_orchestrator_ai_interactions, :cache_key, :string
    add_column :ai_orchestrator_ai_interactions, :cached, :boolean, default: false, null: false
    add_column :ai_orchestrator_ai_interactions, :error_message, :text
    add_column :ai_orchestrator_ai_interactions, :metadata, :jsonb, default: {}

    add_index :ai_orchestrator_ai_interactions, :task_type
    add_index :ai_orchestrator_ai_interactions, :cache_key
    add_index :ai_orchestrator_ai_interactions, :cached
    add_index :ai_orchestrator_ai_interactions, [:user_id, :created_at], name: "idx_ai_interactions_user_date"
  end
end
