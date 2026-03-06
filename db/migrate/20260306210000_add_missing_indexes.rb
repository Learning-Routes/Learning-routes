class AddMissingIndexes < ActiveRecord::Migration[8.1]
  def change
    add_index :assessments_user_answers, :question_id, if_not_exists: true
    add_index :community_engine_comments, :user_id, if_not_exists: true
    add_index :community_engine_likes, :user_id, if_not_exists: true
    add_index :analytics_study_sessions, :user_id, if_not_exists: true
  end
end
