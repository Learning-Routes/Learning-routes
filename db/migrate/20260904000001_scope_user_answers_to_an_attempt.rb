# frozen_string_literal: true

# An answer belonged to a USER and a QUESTION, for the life of the account.
#
#   CREATE UNIQUE INDEX idx_user_answers_on_user_and_question
#     ON assessments_user_answers (user_id, question_id);
#
# There was no `assessment_result_id`, so a second attempt read the first
# attempt's rows and could never score differently. Retakes were impossible by
# data model, not by policy.
#
# The anti-cheat property this replaces is CORRECT and must survive: answers are
# FINAL once given, because otherwise a student clicks each option until one
# grades correct and guarantees 100%. What was wrong is that "final" was
# implemented as final FOREVER, GLOBALLY instead of final WITHIN THIS ATTEMPT.
# Scoped to the attempt the guarantee is exactly as strong — no re-grading inside
# a run — and a retake becomes a real new run.
class ScopeUserAnswersToAnAttempt < ActiveRecord::Migration[8.1]
  OLD_INDEX = "idx_user_answers_on_user_and_question"
  NEW_INDEX = "idx_user_answers_on_result_and_question"

  def up
    add_reference :assessments_user_answers, :assessment_result,
                  type: :uuid, null: true, index: true,
                  foreign_key: { to_table: :assessments_assessment_results }

    # Backfill: attribute every existing answer to that user's EARLIEST attempt
    # at the question's assessment.
    #
    # An answer whose user has no result for that assessment keeps NULL. Those
    # are legacy rows the app treats as belonging to no attempt: they are never
    # counted by `results#submit` (which reads `@result.user_answers`) and never
    # block a new answer, because PostgreSQL treats NULLs as distinct in a unique
    # index, so any number of them can coexist. That is deliberate — inventing an
    # attempt for an answer we cannot place would fabricate history.
    execute(<<~SQL.squish)
      UPDATE assessments_user_answers ua
      SET assessment_result_id = (
        SELECT r.id
        FROM assessments_assessment_results r
        WHERE r.user_id = ua.user_id
          AND r.assessment_id = (
            SELECT q.assessment_id FROM assessments_questions q WHERE q.id = ua.question_id
          )
        ORDER BY r.created_at ASC, r.id ASC
        LIMIT 1
      )
      WHERE ua.assessment_result_id IS NULL
    SQL

    # The old index cannot survive: it is the thing that made a retake
    # impossible. The new one keeps the anti-cheat guarantee inside an attempt.
    #
    # Safe to swap in this order: the old index guaranteed at most one answer per
    # (user, question), and the backfill maps all of one user's answers for an
    # assessment onto a single result — so (assessment_result_id, question_id)
    # cannot collide.
    remove_index :assessments_user_answers, name: OLD_INDEX
    add_index :assessments_user_answers, %i[assessment_result_id question_id],
              unique: true, name: NEW_INDEX
  end

  def down
    # Reversible only while no student has actually retaken anything. Once two
    # attempts hold answers to the same question, restoring a unique index on
    # (user_id, question_id) would have to DELETE one of them, and this migration
    # will not silently destroy a student's work.
    duplicates = select_value(<<~SQL.squish).to_i
      SELECT COUNT(*) FROM (
        SELECT user_id, question_id FROM assessments_user_answers
        GROUP BY user_id, question_id HAVING COUNT(*) > 1
      ) dupes
    SQL

    if duplicates.positive?
      raise ActiveRecord::IrreversibleMigration,
            "#{duplicates} (user, question) pairs now have more than one answer, which is " \
            "what retakes are. Rolling back would require deleting one answer per pair; " \
            "do that deliberately, not as a side effect of a rollback."
    end

    remove_index :assessments_user_answers, name: NEW_INDEX
    remove_reference :assessments_user_answers, :assessment_result,
                     foreign_key: { to_table: :assessments_assessment_results }
    add_index :assessments_user_answers, %i[user_id question_id],
              unique: true, name: OLD_INDEX
  end
end
