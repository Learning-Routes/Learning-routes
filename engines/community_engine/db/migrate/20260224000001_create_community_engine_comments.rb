class CreateCommunityEngineComments < ActiveRecord::Migration[8.1]
  def change
    create_table :community_engine_comments, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :user_id, null: false
      t.string :commentable_type, null: false
      t.uuid :commentable_id, null: false
      t.uuid :parent_id
      t.text :body, null: false
      t.integer :likes_count, default: 0, null: false
      t.integer :replies_count, default: 0, null: false
      t.datetime :edited_at
      t.timestamps
    end

    add_index :community_engine_comments, [:commentable_type, :commentable_id], name: "idx_comments_on_commentable"
    add_index :community_engine_comments, :user_id
    add_index :community_engine_comments, :parent_id
    add_foreign_key :community_engine_comments, :core_users, column: :user_id
  end
end
