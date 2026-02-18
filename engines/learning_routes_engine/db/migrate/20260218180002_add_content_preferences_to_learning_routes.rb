class AddContentPreferencesToLearningRoutes < ActiveRecord::Migration[8.1]
  def change
    add_column :learning_routes_engine_learning_routes, :content_preferences, :jsonb, default: {}, null: false
  end
end
