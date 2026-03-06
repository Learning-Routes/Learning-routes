class AddCompositeIndexesForCommonQueries < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def change
    # Route steps: frequently filtered by route + status (profile, progress tracker, journey)
    add_index :learning_routes_engine_route_steps,
              [:learning_route_id, :status],
              name: "idx_route_steps_on_route_and_status",
              algorithm: :concurrently

    # Learning routes: frequently filtered by profile + status (profile page, dashboard)
    add_index :learning_routes_engine_learning_routes,
              [:learning_profile_id, :status],
              name: "idx_learning_routes_on_profile_and_status",
              algorithm: :concurrently

    # Notifications: polymorphic notifiable lookup
    add_index :community_engine_notifications,
              [:notifiable_type, :notifiable_id],
              name: "idx_notifications_on_notifiable",
              algorithm: :concurrently
  end
end
