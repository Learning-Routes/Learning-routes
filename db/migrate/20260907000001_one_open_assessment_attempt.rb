# frozen_string_literal: true

# A student may have at most ONE open attempt at an assessment.
#
# `assessments#start` did `find_by(user:, assessment:, score: nil)` and then
# `create!`, with nothing in the database to stop the second insert. Two
# concurrent starts — a double-tapped button, a retried POST — opened two
# attempts. `take` then picked an UNORDERED `find_by` while `answers#create`
# picked `.order(:created_at).last`, so the two could disagree about which
# attempt the student was in: the answers landed on one row, `submit` scored the
# other, and the student got 0%, "4 sin responder", and a failed attempt
# recorded for an exam they had actually answered. (WP-32 §4, AUDIT_2026-09-07
# §2.7.)
#
# A SCORED attempt is history and is deliberately outside the index: a retake
# creates another row and must keep being able to.
class OneOpenAssessmentAttempt < ActiveRecord::Migration[8.1]
  INDEX = "idx_open_assessment_attempt_per_student"

  def up
    merge_existing_duplicates!

    add_index :assessments_assessment_results, %i[user_id assessment_id],
              unique: true, where: "score IS NULL", name: INDEX
  end

  def down
    remove_index :assessments_assessment_results, name: INDEX
  end

  private

  # Rows the race already created, resolved without throwing away an answer the
  # student can be said to have given.
  #
  # The keeper is the open attempt with the most answers (ties: the most recent).
  # Every answer on a losing attempt is moved to the keeper UNLESS the keeper
  # already has one for that question — only one attempt can ever be submitted,
  # so a second answer to a question the keeper has answered was never going to
  # be scored by anything. What is left of the losers is then deleted: unscored,
  # unsubmitted rows the student was never told about.
  #
  # Read-only preview of what this will touch, for running before a deploy:
  #
  #   SELECT user_id, assessment_id, COUNT(*)
  #   FROM assessments_assessment_results
  #   WHERE score IS NULL
  #   GROUP BY 1, 2 HAVING COUNT(*) > 1;
  def merge_existing_duplicates!
    duplicates = connection.select_all(<<~SQL.squish).to_a
      SELECT user_id, assessment_id
      FROM assessments_assessment_results
      WHERE score IS NULL
      GROUP BY user_id, assessment_id
      HAVING COUNT(*) > 1
    SQL
    return if duplicates.empty?

    say "merging #{duplicates.size} split assessment attempt(s)"

    duplicates.each do |row|
      ids = connection.select_values(<<~SQL.squish)
        SELECT r.id
        FROM assessments_assessment_results r
        WHERE r.score IS NULL
          AND r.user_id = #{q(row['user_id'])}
          AND r.assessment_id = #{q(row['assessment_id'])}
        ORDER BY (
          SELECT COUNT(*) FROM assessments_user_answers a WHERE a.assessment_result_id = r.id
        ) DESC, r.created_at DESC, r.id DESC
      SQL

      keeper, *losers = ids
      losers.each { |loser| merge_attempt!(loser: loser, keeper: keeper) }
      say "  assessment #{row['assessment_id']}: kept #{keeper}, merged #{losers.size}", true
    end
  end

  def q(value) = connection.quote(value)

  def merge_attempt!(loser:, keeper:)
    connection.execute(<<~SQL.squish)
      UPDATE assessments_user_answers a
      SET assessment_result_id = #{q(keeper)}
      WHERE a.assessment_result_id = #{q(loser)}
        AND NOT EXISTS (
          SELECT 1 FROM assessments_user_answers k
          WHERE k.assessment_result_id = #{q(keeper)}
            AND k.question_id = a.question_id
        )
    SQL
    connection.execute("DELETE FROM assessments_user_answers WHERE assessment_result_id = #{q(loser)}")
    connection.execute("DELETE FROM assessments_assessment_results WHERE id = #{q(loser)}")
  end
end
