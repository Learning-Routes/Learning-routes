class CreateCommunityEngineRatings < ActiveRecord::Migration[8.0]
  def change
    create_table :community_engine_ratings, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :user_id, null: false
      t.uuid :shared_route_id, null: false
      t.integer :score, null: false # 1-5 stars

      t.timestamps
    end

    add_index :community_engine_ratings, [:user_id, :shared_route_id], unique: true, name: "idx_ce_ratings_user_shared_route"
    add_index :community_engine_ratings, :shared_route_id
    add_foreign_key :community_engine_ratings, :core_users, column: :user_id
    add_foreign_key :community_engine_ratings, :community_engine_shared_routes, column: :shared_route_id

    # Add average rating columns to shared_routes
    add_column :community_engine_shared_routes, :ratings_count, :integer, default: 0, null: false
    add_column :community_engine_shared_routes, :ratings_sum, :integer, default: 0, null: false
  end
end
