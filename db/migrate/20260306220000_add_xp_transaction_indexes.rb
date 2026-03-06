class AddXpTransactionIndexes < ActiveRecord::Migration[8.1]
  def change
    add_index :xp_transactions, [:source_type, :source_id], if_not_exists: true
    add_index :xp_transactions, :source_type, if_not_exists: true
  end
end
