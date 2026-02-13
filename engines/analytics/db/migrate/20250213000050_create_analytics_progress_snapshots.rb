class CreateAnalyticsProgressSnapshots < ActiveRecord::Migration[8.1]
  def change
    create_table :analytics_progress_snapshots, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, index: true
      t.references :learning_route, null: false, type: :uuid, index: true
      t.decimal :completion_percentage, precision: 5, scale: 2, default: 0
      t.integer :steps_completed, default: 0
      t.integer :total_steps, default: 0
      t.integer :current_level, default: 0
      t.jsonb :scores, default: {}
      t.date :snapshot_date, null: false

      t.timestamps
    end

    add_index :analytics_progress_snapshots, :snapshot_date
    add_index :analytics_progress_snapshots, [:user_id, :learning_route_id, :snapshot_date],
              unique: true, name: "idx_progress_snapshots_unique"
  end
end
