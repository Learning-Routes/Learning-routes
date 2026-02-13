class CreateAssessmentsAssessmentResults < ActiveRecord::Migration[8.1]
  def change
    create_table :assessments_assessment_results, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, index: true
      t.references :assessment, null: false, type: :uuid, index: true,
                   foreign_key: { to_table: :assessments_assessments }
      t.decimal :score, precision: 5, scale: 2
      t.boolean :passed, default: false, null: false
      t.jsonb :feedback, default: {}
      t.jsonb :knowledge_gaps_identified, default: []

      t.timestamps
    end

    add_index :assessments_assessment_results, [:user_id, :assessment_id],
              name: "idx_results_on_user_and_assessment"
    add_index :assessments_assessment_results, :passed
  end
end
