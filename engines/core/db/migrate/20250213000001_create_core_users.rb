class CreateCoreUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :core_users, id: :uuid do |t|
      t.string :email, null: false
      t.string :name, null: false
      t.string :password_digest, null: false
      t.integer :role, default: 0, null: false
      t.string :avatar_url
      t.string :locale, default: "en", null: false
      t.string :timezone, default: "UTC", null: false

      t.timestamps
    end

    add_index :core_users, :email, unique: true
    add_index :core_users, :role
  end
end
