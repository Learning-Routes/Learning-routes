class AddCostMicrocentsToAiInteractions < ActiveRecord::Migration[8.1]
  def change
    add_column :ai_orchestrator_ai_interactions, :cost_microcents, :bigint,
               null: false, default: 0
    add_index :ai_orchestrator_ai_interactions,
              [:user_id, :created_at, :cost_microcents],
              name: "idx_ai_interactions_usage_billing"
  end
end
