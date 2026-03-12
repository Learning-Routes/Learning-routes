class AddRouteLocaleToRouteRequests < ActiveRecord::Migration[8.1]
  def change
    add_column :route_requests, :route_locale, :string, default: "es", null: false
  end
end
