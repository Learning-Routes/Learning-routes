class CreateCommunityEngineSharedRoutes < ActiveRecord::Migration[8.1]
  def change
    create_table :community_engine_shared_routes, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :learning_route_id, null: false
      t.uuid :user_id, null: false
      t.string :visibility, default: "public", null: false
      t.string :share_token, null: false
      t.text :description
      t.uuid :cloned_from_id
      t.integer :likes_count, default: 0, null: false
      t.integer :comments_count, default: 0, null: false
      t.integer :clones_count, default: 0, null: false
      t.timestamps
    end

    add_index :community_engine_shared_routes, :share_token, unique: true
    add_index :community_engine_shared_routes, :user_id
    add_index :community_engine_shared_routes, :learning_route_id
    add_index :community_engine_shared_routes, [:visibility, :created_at], name: "idx_shared_routes_public_feed"
    add_foreign_key :community_engine_shared_routes, :core_users, column: :user_id
    add_foreign_key :community_engine_shared_routes, :learning_routes_engine_learning_routes, column: :learning_route_id
  end
end
