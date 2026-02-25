class CreateCommunityEngineActivities < ActiveRecord::Migration[8.1]
  def change
    create_table :community_engine_activities, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :user_id, null: false
      t.string :action, null: false
      t.string :trackable_type, null: false
      t.uuid :trackable_id, null: false
      t.jsonb :metadata, default: {}
      t.timestamps
    end

    add_index :community_engine_activities, [:user_id, :created_at], name: "idx_activities_user_timeline"
    add_index :community_engine_activities, [:trackable_type, :trackable_id], name: "idx_activities_on_trackable"
    add_index :community_engine_activities, :action
    add_index :community_engine_activities, :created_at
    add_foreign_key :community_engine_activities, :core_users, column: :user_id
  end
end
