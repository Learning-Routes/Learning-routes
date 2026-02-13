class CreateAnalyticsLearningMetrics < ActiveRecord::Migration[8.1]
  def change
    create_table :analytics_learning_metrics, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, index: true
      t.string :metric_type, null: false
      t.string :subject
      t.decimal :value, precision: 10, scale: 4
      t.jsonb :metadata, default: {}
      t.date :recorded_date, null: false

      t.timestamps
    end

    add_index :analytics_learning_metrics, :metric_type
    add_index :analytics_learning_metrics, :recorded_date
    add_index :analytics_learning_metrics, [:user_id, :metric_type, :recorded_date],
              name: "idx_learning_metrics_user_type_date"
  end
end
