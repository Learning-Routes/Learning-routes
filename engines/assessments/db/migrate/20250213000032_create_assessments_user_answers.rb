class CreateAssessmentsUserAnswers < ActiveRecord::Migration[8.1]
  def change
    create_table :assessments_user_answers, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, index: true
      t.references :question, null: false, type: :uuid, index: true,
                   foreign_key: { to_table: :assessments_questions }
      t.text :answer
      t.boolean :correct
      t.text :feedback

      t.timestamps
    end

    add_index :assessments_user_answers, [:user_id, :question_id], name: "idx_user_answers_on_user_and_question"
  end
end
