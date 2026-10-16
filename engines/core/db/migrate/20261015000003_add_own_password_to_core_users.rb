# STEP 38 §5: an account created through Google gets a random password it never
# sees; Settings offers it "Crear contraseña" (new password only) instead of
# "Cambiar contraseña". Existing Google-linked accounts cannot be told apart from
# Google sign-ups, so all of them start without a password of their own (the
# owner's choice, 2026-10-15).
class AddOwnPasswordToCoreUsers < ActiveRecord::Migration[8.1]
  def up
    add_column :core_users, :own_password, :boolean, null: false, default: true
    execute "UPDATE core_users SET own_password = FALSE WHERE provider IS NOT NULL"
  end

  def down
    remove_column :core_users, :own_password
  end
end
