class AddTranslationsToRoutesAndSteps < ActiveRecord::Migration[8.0]
  def change
    add_column :learning_routes_engine_learning_routes, :locale, :string, default: "en", null: false
    add_column :learning_routes_engine_learning_routes, :translations, :jsonb, default: {}, null: false
    add_column :learning_routes_engine_route_steps, :translations, :jsonb, default: {}, null: false
  end
end
