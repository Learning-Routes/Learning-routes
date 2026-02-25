class CreateCommunityEngineFollows < ActiveRecord::Migration[8.1]
  def change
    create_table :community_engine_follows, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :follower_id, null: false
      t.uuid :followed_id, null: false
      t.timestamps
    end

    add_index :community_engine_follows, :follower_id
    add_index :community_engine_follows, :followed_id
    add_index :community_engine_follows, [:follower_id, :followed_id], unique: true, name: "idx_follows_unique"
    add_foreign_key :community_engine_follows, :core_users, column: :follower_id
    add_foreign_key :community_engine_follows, :core_users, column: :followed_id
  end
end
