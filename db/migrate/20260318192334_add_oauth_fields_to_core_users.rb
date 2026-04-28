class AddOauthFieldsToCoreUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :core_users, :provider, :string unless column_exists?(:core_users, :provider)
    add_column :core_users, :uid, :string unless column_exists?(:core_users, :uid)
    add_column :core_users, :avatar_url, :string unless column_exists?(:core_users, :avatar_url)
    unless index_exists?(:core_users, [:provider, :uid])
      add_index :core_users, [:provider, :uid], unique: true, where: "provider IS NOT NULL"
    end
  end
end
