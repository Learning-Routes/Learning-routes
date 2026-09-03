class CreateCommerceProviderEvents < ActiveRecord::Migration[8.1]
  def up
    create_table :commerce_provider_events, id: :uuid do |t|
      t.string   :provider, null: false
      t.string   :event_identity, null: false
      t.string   :event_name, null: false
      t.boolean  :test_mode, null: false
      t.string   :processing_state, null: false, default: "pending"
      t.jsonb    :evidence, null: false, default: {}
      t.string   :rejection_reason
      t.datetime :processed_at
      t.timestamps
    end

    add_index :commerce_provider_events, [:provider, :event_identity],
              unique: true, name: "idx_provider_events_identity"
    add_index :commerce_provider_events, [:provider, :event_name, :created_at],
              name: "idx_provider_events_name_time"

    execute <<~SQL
      ALTER TABLE commerce_provider_events
        ADD CONSTRAINT provider_events_processing_state
          CHECK (processing_state IN ('pending','processed','rejected')),
        ADD CONSTRAINT provider_events_bounded_evidence
          CHECK (pg_column_size(evidence) <= 8192);
    SQL
  end

  def down
    drop_table :commerce_provider_events
  end
end
