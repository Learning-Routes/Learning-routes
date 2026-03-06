class AddUniqueIndexToLearningProfilesUserId < ActiveRecord::Migration[8.1]
  def change
    remove_index :learning_routes_engine_learning_profiles, :user_id,
                 name: "index_learning_routes_engine_learning_profiles_on_user_id",
                 if_exists: true
    add_index :learning_routes_engine_learning_profiles, :user_id,
              unique: true,
              name: "index_learning_routes_engine_learning_profiles_on_user_id"
  end
end
