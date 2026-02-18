class AddDeliveryFormatToRouteSteps < ActiveRecord::Migration[8.1]
  def change
    add_column :learning_routes_engine_route_steps, :delivery_format, :string, default: "mixed"
  end
end
