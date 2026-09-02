class CreateOwnerAuditEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :owner_audit_events, id: :uuid do |t|
      t.string :action, null: false
      t.references :actor_user, type: :uuid, foreign_key: { to_table: :core_users, on_delete: :nullify }
      t.references :subject_user, type: :uuid, foreign_key: { to_table: :core_users, on_delete: :nullify }
      t.string :request_id
      t.string :ip_digest
      t.string :user_agent_digest
      t.jsonb :metadata, null: false, default: {}
      t.timestamps
    end

    add_index :owner_audit_events, [:action, :created_at]
  end
end
