class CreateLearningRoutesEngineLearningProfiles < ActiveRecord::Migration[8.1]
  def change
    create_table :learning_routes_engine_learning_profiles, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, index: true
      t.string :current_level, default: "beginner", null: false
      t.jsonb :interests, default: []
      t.jsonb :learning_style, default: []
      t.jsonb :assessment_data, default: {}
      t.string :goal
      t.string :timeline

      t.timestamps
    end

    add_index :learning_routes_engine_learning_profiles, :current_level
  end
end
