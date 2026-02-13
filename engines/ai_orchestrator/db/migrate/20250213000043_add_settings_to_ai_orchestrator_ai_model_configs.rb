class AddSettingsToAiOrchestratorAiModelConfigs < ActiveRecord::Migration[8.1]
  def change
    add_column :ai_orchestrator_ai_model_configs, :settings, :jsonb, default: {}
  end
end
