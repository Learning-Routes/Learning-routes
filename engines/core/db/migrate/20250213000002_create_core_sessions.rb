class CreateCoreSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :core_sessions, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, index: true,
                   foreign_key: { to_table: :core_users, on_delete: :cascade }
      t.string :ip_address
      t.string :user_agent
      t.datetime :last_active_at

      t.timestamps
    end
  end
end
