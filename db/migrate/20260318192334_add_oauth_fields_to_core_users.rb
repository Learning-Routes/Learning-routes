class AddOauthFieldsToCoreUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :core_users, :provider, :string
    add_column :core_users, :uid, :string
    add_column :core_users, :avatar_url, :string
    add_index :core_users, [:provider, :uid], unique: true, where: "provider IS NOT NULL"
  end
end
