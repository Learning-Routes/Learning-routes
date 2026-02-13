class CreateAssessmentsAssessments < ActiveRecord::Migration[8.1]
  def change
    create_table :assessments_assessments, id: :uuid do |t|
      t.references :route_step, null: false, type: :uuid, index: true
      t.integer :assessment_type, default: 0, null: false
      t.jsonb :questions, default: []
      t.integer :time_limit_minutes
      t.decimal :passing_score, precision: 5, scale: 2, default: 70.0

      t.timestamps
    end

    add_index :assessments_assessments, :assessment_type
  end
end
