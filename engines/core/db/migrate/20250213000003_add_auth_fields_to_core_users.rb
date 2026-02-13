class AddAuthFieldsToCoreUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :core_users, :email_verified_at, :datetime
    add_column :core_users, :remember_token, :string
    add_column :core_users, :onboarding_completed, :boolean, default: false, null: false

    add_index :core_users, :remember_token, unique: true
    add_index :core_users, :onboarding_completed
  end
end
