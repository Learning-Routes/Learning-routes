class EnforceSingleOwner < ActiveRecord::Migration[8.1]
  def change
    add_index :core_users, :role,
              unique: true,
              where: "role = 2",
              name: "idx_core_users_single_owner"
  end
end
