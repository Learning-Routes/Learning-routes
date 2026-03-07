class AddMissingForeignKeys < ActiveRecord::Migration[8.1]
  def change
    # Clean orphan records before adding constraints
    reversible do |dir|
      dir.up do
        # Nullify orphan route_step_id references in study_sessions
        execute <<~SQL
          UPDATE analytics_study_sessions
          SET route_step_id = NULL
          WHERE route_step_id IS NOT NULL
            AND route_step_id NOT IN (SELECT id FROM learning_routes_engine_route_steps)
        SQL

        # Nullify orphan learning_route_id references in study_sessions
        execute <<~SQL
          UPDATE analytics_study_sessions
          SET learning_route_id = NULL
          WHERE learning_route_id IS NOT NULL
            AND learning_route_id NOT IN (SELECT id FROM learning_routes_engine_learning_routes)
        SQL

        # Delete orphan progress_snapshots with missing learning_route_id
        execute <<~SQL
          DELETE FROM analytics_progress_snapshots
          WHERE learning_route_id NOT IN (SELECT id FROM learning_routes_engine_learning_routes)
        SQL

        # Delete orphan ai_contents with missing route_step_id
        execute <<~SQL
          DELETE FROM content_engine_ai_contents
          WHERE route_step_id NOT IN (SELECT id FROM learning_routes_engine_route_steps)
        SQL

        # Delete orphan assessments with missing route_step_id
        execute <<~SQL
          DELETE FROM assessments_assessments
          WHERE route_step_id NOT IN (SELECT id FROM learning_routes_engine_route_steps)
        SQL

        # Delete orphan user_notes with missing route_step_id
        execute <<~SQL
          DELETE FROM content_engine_user_notes
          WHERE route_step_id NOT IN (SELECT id FROM learning_routes_engine_route_steps)
        SQL
      end
    end

    # user_id → core_users (9 tables missing FK)
    add_foreign_key :ai_orchestrator_ai_interactions, :core_users, column: :user_id, on_delete: :nullify
    add_foreign_key :analytics_learning_metrics, :core_users, column: :user_id, on_delete: :cascade
    add_foreign_key :analytics_progress_snapshots, :core_users, column: :user_id, on_delete: :cascade
    add_foreign_key :analytics_study_sessions, :core_users, column: :user_id, on_delete: :cascade
    add_foreign_key :content_engine_user_notes, :core_users, column: :user_id, on_delete: :cascade
    add_foreign_key :assessments_assessment_results, :core_users, column: :user_id, on_delete: :cascade
    add_foreign_key :assessments_user_answers, :core_users, column: :user_id, on_delete: :cascade
    add_foreign_key :learning_routes_engine_knowledge_gaps, :core_users, column: :user_id, on_delete: :cascade
    add_foreign_key :learning_routes_engine_learning_profiles, :core_users, column: :user_id, on_delete: :cascade

    # route_step_id → learning_routes_engine_route_steps (4 tables missing FK)
    add_foreign_key :analytics_study_sessions, :learning_routes_engine_route_steps, column: :route_step_id, on_delete: :nullify
    add_foreign_key :content_engine_user_notes, :learning_routes_engine_route_steps, column: :route_step_id, on_delete: :cascade
    add_foreign_key :assessments_assessments, :learning_routes_engine_route_steps, column: :route_step_id, on_delete: :cascade
    add_foreign_key :content_engine_ai_contents, :learning_routes_engine_route_steps, column: :route_step_id, on_delete: :cascade

    # learning_route_id → learning_routes_engine_learning_routes (2 tables missing FK)
    add_foreign_key :analytics_progress_snapshots, :learning_routes_engine_learning_routes, column: :learning_route_id, on_delete: :cascade
    add_foreign_key :analytics_study_sessions, :learning_routes_engine_learning_routes, column: :learning_route_id, on_delete: :nullify
  end
end
