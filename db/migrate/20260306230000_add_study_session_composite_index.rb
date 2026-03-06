class AddStudySessionCompositeIndex < ActiveRecord::Migration[8.1]
  def change
    add_index :analytics_study_sessions, [:user_id, :route_step_id, :ended_at],
              name: "idx_study_sessions_user_step_active", if_not_exists: true
  end
end
