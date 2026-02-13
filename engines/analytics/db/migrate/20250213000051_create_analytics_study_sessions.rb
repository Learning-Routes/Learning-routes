class CreateAnalyticsStudySessions < ActiveRecord::Migration[8.1]
  def change
    create_table :analytics_study_sessions, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, index: true
      t.references :learning_route, type: :uuid, index: true
      t.datetime :started_at, null: false
      t.datetime :ended_at
      t.integer :duration_minutes, default: 0
      t.integer :steps_completed, default: 0
      t.jsonb :activity_log, default: []

      t.timestamps
    end

    add_index :analytics_study_sessions, :started_at
  end
end
