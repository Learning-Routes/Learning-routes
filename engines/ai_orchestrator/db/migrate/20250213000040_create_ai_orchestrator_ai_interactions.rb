class CreateAiOrchestratorAiInteractions < ActiveRecord::Migration[8.1]
  def change
    create_table :ai_orchestrator_ai_interactions, id: :uuid do |t|
      t.references :user, type: :uuid, index: true
      t.string :model, null: false
      t.text :prompt, null: false
      t.text :response
      t.integer :tokens_used, default: 0
      t.integer :cost_cents, default: 0
      t.integer :latency_ms
      t.integer :status, default: 0, null: false

      t.timestamps
    end

    add_index :ai_orchestrator_ai_interactions, :model
    add_index :ai_orchestrator_ai_interactions, :status
    add_index :ai_orchestrator_ai_interactions, :created_at
  end
end
