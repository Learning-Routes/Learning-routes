class CreateAssessmentsQuestions < ActiveRecord::Migration[8.1]
  def change
    create_table :assessments_questions, id: :uuid do |t|
      t.references :assessment, null: false, type: :uuid, index: true,
                   foreign_key: { to_table: :assessments_assessments }
      t.text :body, null: false
      t.integer :question_type, default: 0, null: false
      t.jsonb :options, default: []
      t.text :correct_answer
      t.text :explanation
      t.integer :difficulty, default: 1
      t.integer :bloom_level, default: 1

      t.timestamps
    end

    add_index :assessments_questions, :question_type
    add_index :assessments_questions, :difficulty
    add_index :assessments_questions, :bloom_level
  end
end
