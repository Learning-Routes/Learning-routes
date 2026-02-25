class CreateCommunityEngineNotifications < ActiveRecord::Migration[8.1]
  def change
    create_table :community_engine_notifications, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :user_id, null: false
      t.uuid :actor_id, null: false
      t.string :notifiable_type, null: false
      t.uuid :notifiable_id, null: false
      t.string :notification_type, null: false
      t.datetime :read_at
      t.jsonb :metadata, default: {}
      t.timestamps
    end

    add_index :community_engine_notifications, [:user_id, :read_at, :created_at], name: "idx_notifications_user_unread"
    add_index :community_engine_notifications, [:user_id, :notification_type], name: "idx_notifications_user_type"
    add_index :community_engine_notifications, :actor_id
    add_foreign_key :community_engine_notifications, :core_users, column: :user_id
    add_foreign_key :community_engine_notifications, :core_users, column: :actor_id
  end
end
