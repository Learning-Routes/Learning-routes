class AddThemeToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :core_users, :theme, :string, default: "system", null: false

    # Missing indexes for performance
    add_index :community_engine_comments, :parent_id, if_not_exists: true
    add_index :community_engine_comments, [:user_id, :created_at], if_not_exists: true
    add_index :community_engine_notifications, :user_id, if_not_exists: true
    add_index :community_engine_shared_routes, :cloned_from_id, if_not_exists: true

    # Missing foreign key for comment parent
    add_foreign_key :community_engine_comments, :community_engine_comments, column: :parent_id, on_delete: :cascade, if_not_exists: true
  end
end
