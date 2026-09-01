class AddProviderPricingToAiInteractions < ActiveRecord::Migration[8.1]
  def change
    change_table :ai_orchestrator_ai_interactions, bulk: true do |t|
      t.bigint :provider_units
      t.bigint :provider_rate_microcents
      t.string :pricing_status, null: false, default: "unpriced"
      t.string :pricing_version
    end

    add_index :ai_orchestrator_ai_interactions, :pricing_status
  end
end
