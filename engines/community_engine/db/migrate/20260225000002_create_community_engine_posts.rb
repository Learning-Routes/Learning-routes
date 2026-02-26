class CreateCommunityEnginePosts < ActiveRecord::Migration[8.0]
  def change
    create_table :community_engine_posts, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :user_id, null: false
      t.text :body, null: false
      t.integer :likes_count, default: 0, null: false
      t.integer :comments_count, default: 0, null: false

      t.timestamps
    end

    add_index :community_engine_posts, :user_id
    add_index :community_engine_posts, :created_at
    add_foreign_key :community_engine_posts, :core_users, column: :user_id
  end
end
