class CreateEngagementTables < ActiveRecord::Migration[8.1]
  def change
    create_table :user_engagements, id: :uuid do |t|
      t.references :user, null: false, foreign_key: { to_table: :core_users }, type: :uuid, index: { unique: true }
      t.integer :current_streak, default: 0, null: false
      t.integer :longest_streak, default: 0, null: false
      t.date :last_activity_date
      t.integer :streak_freezes_available, default: 1, null: false
      t.boolean :streak_freeze_used_today, default: false
      t.integer :total_xp, default: 0, null: false
      t.integer :current_level, default: 1, null: false
      t.integer :xp_to_next_level, default: 100, null: false
      t.string :current_league, default: "bronze"
      t.jsonb :weekly_xp, default: {}, null: false
      t.jsonb :preferences, default: {}, null: false
      t.timestamps
    end

    create_table :xp_transactions, id: :uuid do |t|
      t.references :user, null: false, foreign_key: { to_table: :core_users }, type: :uuid
      t.integer :amount, null: false
      t.string :source_type, null: false
      t.string :source_id
      t.jsonb :metadata, default: {}
      t.timestamps
    end

    add_index :xp_transactions, [:user_id, :created_at]
  end
end
