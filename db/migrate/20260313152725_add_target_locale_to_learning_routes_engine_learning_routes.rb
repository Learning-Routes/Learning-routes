class AddTargetLocaleToLearningRoutesEngineLearningRoutes < ActiveRecord::Migration[8.1]
  def change
    add_column :learning_routes_engine_learning_routes, :target_locale, :string
  end
end
