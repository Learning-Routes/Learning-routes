class CreateCommunityEngineLikes < ActiveRecord::Migration[8.1]
  def change
    create_table :community_engine_likes, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :user_id, null: false
      t.string :likeable_type, null: false
      t.uuid :likeable_id, null: false
      t.timestamps
    end

    add_index :community_engine_likes, [:likeable_type, :likeable_id], name: "idx_likes_on_likeable"
    add_index :community_engine_likes, :user_id
    add_index :community_engine_likes, [:user_id, :likeable_type, :likeable_id], unique: true, name: "idx_likes_unique_per_user"
    add_foreign_key :community_engine_likes, :core_users, column: :user_id
  end
end
