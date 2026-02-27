class AddWizardPreferences < ActiveRecord::Migration[8.1]
  def change
    # Route request: time commitment fields
    add_column :route_requests, :weekly_hours, :integer
    add_column :route_requests, :session_minutes, :integer

    # Learning profile: saved wizard preferences so users don't repeat VARK test
    add_column :learning_routes_engine_learning_profiles, :preferred_pace, :string
    add_column :learning_routes_engine_learning_profiles, :preferred_goals, :jsonb, default: []
    add_column :learning_routes_engine_learning_profiles, :saved_style_answers, :jsonb, default: {}
    add_column :learning_routes_engine_learning_profiles, :saved_style_result, :jsonb, default: {}
    add_column :learning_routes_engine_learning_profiles, :weekly_hours, :integer
    add_column :learning_routes_engine_learning_profiles, :session_minutes, :integer
  end
end
