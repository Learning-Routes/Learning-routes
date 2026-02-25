class AddSocialCountersToExistingTables < ActiveRecord::Migration[8.1]
  def change
    # Counter caches for likes/comments on learning routes
    add_column :learning_routes_engine_learning_routes, :likes_count, :integer, default: 0, null: false
    add_column :learning_routes_engine_learning_routes, :comments_count, :integer, default: 0, null: false

    # Counter caches for likes/comments on route steps
    add_column :learning_routes_engine_route_steps, :likes_count, :integer, default: 0, null: false
    add_column :learning_routes_engine_route_steps, :comments_count, :integer, default: 0, null: false

    # Followers/following counters on users
    add_column :core_users, :followers_count, :integer, default: 0, null: false
    add_column :core_users, :following_count, :integer, default: 0, null: false
  end
end
