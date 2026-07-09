# frozen_string_literal: true

# Enforce one answer per (user, question) at the database level. Without this,
# concurrent POSTs to answers#create (one per multiple-choice option) each slip
# past the app-level find_by and create a separately-graded row — letting a
# student guarantee a correct answer (and even push the score above 100%, since
# scoring counts every `correct: true` row against a fixed question total).
class AddUniqueIndexToUserAnswers < ActiveRecord::Migration[8.1]
  def up
    # Defensive dedupe (keep the most recently updated row per pair; ctid breaks
    # exact-timestamp ties) so the unique index can be created on existing data.
    execute <<~SQL
      DELETE FROM assessments_user_answers a
      USING assessments_user_answers b
      WHERE a.user_id = b.user_id
        AND a.question_id = b.question_id
        AND (a.updated_at < b.updated_at
             OR (a.updated_at = b.updated_at AND a.ctid < b.ctid))
    SQL

    remove_index :assessments_user_answers,
                 name: "idx_user_answers_on_user_and_question", if_exists: true
    add_index :assessments_user_answers, [:user_id, :question_id],
              unique: true, name: "idx_user_answers_on_user_and_question"
  end

  def down
    remove_index :assessments_user_answers,
                 name: "idx_user_answers_on_user_and_question", if_exists: true
    add_index :assessments_user_answers, [:user_id, :question_id],
              name: "idx_user_answers_on_user_and_question"
  end
end
