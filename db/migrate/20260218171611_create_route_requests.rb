class CreateRouteRequests < ActiveRecord::Migration[8.1]
  def change
    create_table :route_requests, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, foreign_key: { to_table: :core_users }
      t.jsonb :topics, default: [], null: false
      t.string :custom_topic
      t.string :level, null: false
      t.jsonb :goals, default: [], null: false
      t.string :pace, null: false
      t.string :status, default: "pending", null: false
      t.references :learning_route, type: :uuid, foreign_key: { to_table: :learning_routes_engine_learning_routes }
      t.text :error_message
      t.timestamps
    end

    add_index :route_requests, :status
    add_index :route_requests, [:user_id, :created_at]
  end
end
