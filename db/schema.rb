# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_02_25_204430) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "ai_orchestrator_ai_interactions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "cache_key"
    t.boolean "cached", default: false, null: false
    t.integer "cost_cents", default: 0
    t.datetime "created_at", null: false
    t.text "error_message"
    t.integer "input_tokens", default: 0
    t.integer "latency_ms"
    t.jsonb "metadata", default: {}
    t.string "model", null: false
    t.integer "output_tokens", default: 0
    t.text "prompt", null: false
    t.text "response"
    t.integer "status", default: 0, null: false
    t.string "task_type"
    t.integer "tokens_used", default: 0
    t.datetime "updated_at", null: false
    t.uuid "user_id"
    t.index ["cache_key"], name: "index_ai_orchestrator_ai_interactions_on_cache_key"
    t.index ["cached"], name: "index_ai_orchestrator_ai_interactions_on_cached"
    t.index ["created_at"], name: "index_ai_orchestrator_ai_interactions_on_created_at"
    t.index ["model"], name: "index_ai_orchestrator_ai_interactions_on_model"
    t.index ["status"], name: "index_ai_orchestrator_ai_interactions_on_status"
    t.index ["task_type"], name: "index_ai_orchestrator_ai_interactions_on_task_type"
    t.index ["user_id", "created_at"], name: "idx_ai_interactions_user_date"
    t.index ["user_id"], name: "index_ai_orchestrator_ai_interactions_on_user_id"
  end

  create_table "ai_orchestrator_ai_model_configs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.boolean "enabled", default: true, null: false
    t.string "fallback_model"
    t.string "model_name", null: false
    t.integer "priority", default: 0, null: false
    t.integer "rate_limit"
    t.jsonb "settings", default: {}
    t.string "task_type", null: false
    t.datetime "updated_at", null: false
    t.index ["enabled"], name: "index_ai_orchestrator_ai_model_configs_on_enabled"
    t.index ["model_name"], name: "index_ai_orchestrator_ai_model_configs_on_model_name"
    t.index ["task_type", "priority"], name: "idx_model_configs_on_task_and_priority"
  end

  create_table "analytics_learning_metrics", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.jsonb "metadata", default: {}
    t.string "metric_type", null: false
    t.date "recorded_date", null: false
    t.string "subject"
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.decimal "value", precision: 10, scale: 4
    t.index ["metric_type"], name: "index_analytics_learning_metrics_on_metric_type"
    t.index ["recorded_date"], name: "index_analytics_learning_metrics_on_recorded_date"
    t.index ["user_id", "metric_type", "recorded_date"], name: "idx_learning_metrics_user_type_date"
    t.index ["user_id"], name: "index_analytics_learning_metrics_on_user_id"
  end

  create_table "analytics_progress_snapshots", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.decimal "completion_percentage", precision: 5, scale: 2, default: "0.0"
    t.datetime "created_at", null: false
    t.integer "current_level", default: 0
    t.uuid "learning_route_id", null: false
    t.jsonb "scores", default: {}
    t.date "snapshot_date", null: false
    t.integer "steps_completed", default: 0
    t.integer "total_steps", default: 0
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["learning_route_id"], name: "index_analytics_progress_snapshots_on_learning_route_id"
    t.index ["snapshot_date"], name: "index_analytics_progress_snapshots_on_snapshot_date"
    t.index ["user_id", "learning_route_id", "snapshot_date"], name: "idx_progress_snapshots_unique", unique: true
    t.index ["user_id"], name: "index_analytics_progress_snapshots_on_user_id"
  end

  create_table "analytics_study_sessions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.jsonb "activity_log", default: []
    t.datetime "created_at", null: false
    t.integer "duration_minutes", default: 0
    t.datetime "ended_at"
    t.uuid "learning_route_id"
    t.uuid "route_step_id"
    t.datetime "started_at", null: false
    t.integer "steps_completed", default: 0
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["learning_route_id"], name: "index_analytics_study_sessions_on_learning_route_id"
    t.index ["route_step_id"], name: "index_analytics_study_sessions_on_route_step_id"
    t.index ["started_at"], name: "index_analytics_study_sessions_on_started_at"
    t.index ["user_id"], name: "index_analytics_study_sessions_on_user_id"
  end

  create_table "assessments_assessment_results", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "assessment_id", null: false
    t.datetime "created_at", null: false
    t.jsonb "feedback", default: {}
    t.jsonb "knowledge_gaps_identified", default: []
    t.boolean "passed", default: false, null: false
    t.decimal "score", precision: 5, scale: 2
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["assessment_id"], name: "index_assessments_assessment_results_on_assessment_id"
    t.index ["passed"], name: "index_assessments_assessment_results_on_passed"
    t.index ["user_id", "assessment_id"], name: "idx_results_on_user_and_assessment"
    t.index ["user_id"], name: "index_assessments_assessment_results_on_user_id"
  end

  create_table "assessments_assessments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.integer "assessment_type", default: 0, null: false
    t.datetime "created_at", null: false
    t.decimal "passing_score", precision: 5, scale: 2, default: "70.0"
    t.jsonb "questions", default: []
    t.uuid "route_step_id", null: false
    t.integer "time_limit_minutes"
    t.datetime "updated_at", null: false
    t.index ["assessment_type"], name: "index_assessments_assessments_on_assessment_type"
    t.index ["route_step_id"], name: "index_assessments_assessments_on_route_step_id"
  end

  create_table "assessments_questions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "assessment_id", null: false
    t.integer "bloom_level", default: 1
    t.text "body", null: false
    t.text "correct_answer"
    t.datetime "created_at", null: false
    t.integer "difficulty", default: 1
    t.text "explanation"
    t.jsonb "options", default: []
    t.integer "question_type", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["assessment_id"], name: "index_assessments_questions_on_assessment_id"
    t.index ["bloom_level"], name: "index_assessments_questions_on_bloom_level"
    t.index ["difficulty"], name: "index_assessments_questions_on_difficulty"
    t.index ["question_type"], name: "index_assessments_questions_on_question_type"
  end

  create_table "assessments_user_answers", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "answer"
    t.boolean "correct"
    t.datetime "created_at", null: false
    t.text "feedback"
    t.uuid "question_id", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["question_id"], name: "index_assessments_user_answers_on_question_id"
    t.index ["user_id", "question_id"], name: "idx_user_answers_on_user_and_question"
    t.index ["user_id"], name: "index_assessments_user_answers_on_user_id"
  end

  create_table "assessments_voice_responses", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.jsonb "ai_evaluation", default: {}
    t.uuid "assessment_result_id"
    t.string "audio_blob_key", null: false
    t.datetime "created_at", null: false
    t.uuid "route_step_id", null: false
    t.integer "score"
    t.string "status", default: "pending", null: false
    t.text "transcription"
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["assessment_result_id"], name: "index_assessments_voice_responses_on_assessment_result_id"
    t.index ["route_step_id"], name: "index_assessments_voice_responses_on_route_step_id"
    t.index ["status"], name: "index_assessments_voice_responses_on_status"
    t.index ["user_id", "route_step_id"], name: "idx_voice_responses_user_step"
    t.index ["user_id"], name: "index_assessments_voice_responses_on_user_id"
  end

  create_table "community_engine_activities", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "action", null: false
    t.datetime "created_at", null: false
    t.jsonb "metadata", default: {}
    t.uuid "trackable_id", null: false
    t.string "trackable_type", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["action"], name: "index_community_engine_activities_on_action"
    t.index ["created_at"], name: "index_community_engine_activities_on_created_at"
    t.index ["trackable_type", "trackable_id"], name: "idx_activities_on_trackable"
    t.index ["user_id", "created_at"], name: "idx_activities_user_timeline"
  end

  create_table "community_engine_comments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "body", null: false
    t.uuid "commentable_id", null: false
    t.string "commentable_type", null: false
    t.datetime "created_at", null: false
    t.datetime "edited_at"
    t.integer "likes_count", default: 0, null: false
    t.uuid "parent_id"
    t.integer "replies_count", default: 0, null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["commentable_type", "commentable_id"], name: "idx_comments_on_commentable"
    t.index ["parent_id"], name: "index_community_engine_comments_on_parent_id"
    t.index ["user_id", "created_at"], name: "index_community_engine_comments_on_user_id_and_created_at"
    t.index ["user_id"], name: "index_community_engine_comments_on_user_id"
  end

  create_table "community_engine_follows", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.uuid "followed_id", null: false
    t.uuid "follower_id", null: false
    t.datetime "updated_at", null: false
    t.index ["followed_id"], name: "index_community_engine_follows_on_followed_id"
    t.index ["follower_id", "followed_id"], name: "idx_follows_unique", unique: true
    t.index ["follower_id"], name: "index_community_engine_follows_on_follower_id"
  end

  create_table "community_engine_likes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.uuid "likeable_id", null: false
    t.string "likeable_type", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["likeable_type", "likeable_id"], name: "idx_likes_on_likeable"
    t.index ["user_id", "likeable_type", "likeable_id"], name: "idx_likes_unique_per_user", unique: true
    t.index ["user_id"], name: "index_community_engine_likes_on_user_id"
  end

  create_table "community_engine_notifications", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "actor_id", null: false
    t.datetime "created_at", null: false
    t.jsonb "metadata", default: {}
    t.uuid "notifiable_id", null: false
    t.string "notifiable_type", null: false
    t.string "notification_type", null: false
    t.datetime "read_at"
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["actor_id"], name: "index_community_engine_notifications_on_actor_id"
    t.index ["user_id", "notification_type"], name: "idx_notifications_user_type"
    t.index ["user_id", "read_at", "created_at"], name: "idx_notifications_user_unread"
    t.index ["user_id"], name: "index_community_engine_notifications_on_user_id"
  end

  create_table "community_engine_posts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "body", null: false
    t.integer "comments_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.integer "likes_count", default: 0, null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["created_at"], name: "index_community_engine_posts_on_created_at"
    t.index ["user_id"], name: "index_community_engine_posts_on_user_id"
  end

  create_table "community_engine_ratings", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "score", null: false
    t.uuid "shared_route_id", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["shared_route_id"], name: "index_community_engine_ratings_on_shared_route_id"
    t.index ["user_id", "shared_route_id"], name: "idx_ce_ratings_user_shared_route", unique: true
  end

  create_table "community_engine_shared_routes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "cloned_from_id"
    t.integer "clones_count", default: 0, null: false
    t.integer "comments_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.uuid "learning_route_id", null: false
    t.integer "likes_count", default: 0, null: false
    t.integer "ratings_count", default: 0, null: false
    t.integer "ratings_sum", default: 0, null: false
    t.string "share_token", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.string "visibility", default: "public", null: false
    t.index ["cloned_from_id"], name: "index_community_engine_shared_routes_on_cloned_from_id"
    t.index ["learning_route_id"], name: "index_community_engine_shared_routes_on_learning_route_id"
    t.index ["share_token"], name: "index_community_engine_shared_routes_on_share_token", unique: true
    t.index ["user_id"], name: "index_community_engine_shared_routes_on_user_id"
    t.index ["visibility", "created_at"], name: "idx_shared_routes_public_feed"
  end

  create_table "content_engine_ai_contents", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "ai_model"
    t.float "audio_duration"
    t.string "audio_status", default: "pending", null: false
    t.text "audio_transcript"
    t.string "audio_url"
    t.text "body"
    t.boolean "cached", default: false, null: false
    t.integer "content_type", default: 0, null: false
    t.datetime "created_at", null: false
    t.decimal "generation_cost", precision: 10, scale: 4, default: "0.0"
    t.string "image_url"
    t.jsonb "metadata", default: {}
    t.uuid "route_step_id", null: false
    t.integer "tokens_used", default: 0
    t.datetime "updated_at", null: false
    t.string "voice_id"
    t.index ["ai_model"], name: "index_content_engine_ai_contents_on_ai_model"
    t.index ["audio_status"], name: "index_content_engine_ai_contents_on_audio_status"
    t.index ["cached"], name: "index_content_engine_ai_contents_on_cached"
    t.index ["content_type"], name: "index_content_engine_ai_contents_on_content_type"
    t.index ["route_step_id"], name: "index_content_engine_ai_contents_on_route_step_id"
  end

  create_table "content_engine_content_caches", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "cache_key", null: false
    t.text "content", null: false
    t.string "content_type"
    t.datetime "created_at", null: false
    t.datetime "expires_at"
    t.jsonb "metadata", default: {}
    t.datetime "updated_at", null: false
    t.index ["cache_key"], name: "index_content_engine_content_caches_on_cache_key", unique: true
    t.index ["expires_at"], name: "index_content_engine_content_caches_on_expires_at"
  end

  create_table "content_engine_user_notes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.uuid "route_step_id", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["route_step_id"], name: "index_content_engine_user_notes_on_route_step_id"
    t.index ["user_id", "route_step_id"], name: "idx_user_notes_on_user_and_step"
    t.index ["user_id"], name: "index_content_engine_user_notes_on_user_id"
  end

  create_table "core_sessions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "ip_address"
    t.datetime "last_active_at"
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.uuid "user_id", null: false
    t.index ["user_id"], name: "index_core_sessions_on_user_id"
  end

  create_table "core_users", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "avatar_url"
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.datetime "email_verified_at"
    t.integer "followers_count", default: 0, null: false
    t.integer "following_count", default: 0, null: false
    t.string "locale", default: "en", null: false
    t.string "name", null: false
    t.boolean "onboarding_completed", default: false, null: false
    t.string "password_digest", null: false
    t.string "remember_token"
    t.integer "role", default: 0, null: false
    t.string "theme", default: "system", null: false
    t.string "timezone", default: "UTC", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_core_users_on_email", unique: true
    t.index ["onboarding_completed"], name: "index_core_users_on_onboarding_completed"
    t.index ["remember_token"], name: "index_core_users_on_remember_token", unique: true
    t.index ["role"], name: "index_core_users_on_role"
  end

  create_table "learning_routes_engine_knowledge_gaps", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.string "identified_from"
    t.uuid "learning_route_id", null: false
    t.boolean "resolved", default: false, null: false
    t.integer "severity", default: 0, null: false
    t.string "topic", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["learning_route_id"], name: "idx_on_learning_route_id_995e696068"
    t.index ["resolved"], name: "index_learning_routes_engine_knowledge_gaps_on_resolved"
    t.index ["severity"], name: "index_learning_routes_engine_knowledge_gaps_on_severity"
    t.index ["user_id"], name: "index_learning_routes_engine_knowledge_gaps_on_user_id"
  end

  create_table "learning_routes_engine_learning_profiles", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.jsonb "assessment_data", default: {}
    t.datetime "created_at", null: false
    t.string "current_level", default: "beginner", null: false
    t.string "goal"
    t.jsonb "interests", default: []
    t.jsonb "learning_style", default: []
    t.string "timeline"
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["current_level"], name: "idx_on_current_level_1784842c74"
    t.index ["user_id"], name: "index_learning_routes_engine_learning_profiles_on_user_id"
  end

  create_table "learning_routes_engine_learning_routes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "ai_interaction_id"
    t.string "ai_model_used"
    t.integer "comments_count", default: 0, null: false
    t.jsonb "content_preferences", default: {}, null: false
    t.datetime "created_at", null: false
    t.integer "current_step", default: 0
    t.jsonb "difficulty_progression", default: {}
    t.datetime "generated_at"
    t.jsonb "generation_params", default: {}
    t.string "generation_status"
    t.uuid "learning_profile_id", null: false
    t.integer "likes_count", default: 0, null: false
    t.string "locale", default: "en", null: false
    t.integer "status", default: 0, null: false
    t.string "subject_area"
    t.string "topic", null: false
    t.integer "total_steps", default: 0
    t.jsonb "translations", default: {}, null: false
    t.datetime "updated_at", null: false
    t.index ["ai_interaction_id"], name: "idx_learning_routes_on_ai_interaction"
    t.index ["generation_status"], name: "idx_learning_routes_on_generation_status"
    t.index ["learning_profile_id"], name: "idx_on_learning_profile_id_5e77d3d179"
    t.index ["status"], name: "index_learning_routes_engine_learning_routes_on_status"
    t.index ["topic"], name: "index_learning_routes_engine_learning_routes_on_topic"
  end

  create_table "learning_routes_engine_reinforcement_routes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.uuid "knowledge_gap_id", null: false
    t.uuid "learning_route_id", null: false
    t.integer "status", default: 0, null: false
    t.jsonb "steps", default: []
    t.datetime "updated_at", null: false
    t.index ["knowledge_gap_id"], name: "idx_on_knowledge_gap_id_b5983a11b7"
    t.index ["learning_route_id"], name: "idx_on_learning_route_id_8445f8b9bc"
    t.index ["status"], name: "index_learning_routes_engine_reinforcement_routes_on_status"
  end

  create_table "learning_routes_engine_route_steps", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.integer "bloom_level"
    t.integer "comments_count", default: 0, null: false
    t.datetime "completed_at"
    t.integer "content_type", default: 0, null: false
    t.datetime "created_at", null: false
    t.string "delivery_format", default: "mixed"
    t.text "description"
    t.integer "estimated_minutes"
    t.float "fsrs_difficulty", default: 0.0
    t.float "fsrs_elapsed_days", default: 0.0
    t.integer "fsrs_lapses", default: 0
    t.datetime "fsrs_last_review_at"
    t.datetime "fsrs_next_review_at"
    t.integer "fsrs_reps", default: 0
    t.float "fsrs_scheduled_days", default: 0.0
    t.float "fsrs_stability", default: 0.0
    t.integer "fsrs_state", default: 0
    t.uuid "learning_route_id", null: false
    t.integer "level", default: 0, null: false
    t.integer "likes_count", default: 0, null: false
    t.jsonb "metadata", default: {}
    t.integer "position", null: false
    t.jsonb "prerequisites", default: []
    t.integer "status", default: 0, null: false
    t.string "title", null: false
    t.jsonb "translations", default: {}, null: false
    t.datetime "updated_at", null: false
    t.index ["fsrs_next_review_at"], name: "idx_route_steps_on_fsrs_next_review"
    t.index ["fsrs_state"], name: "idx_route_steps_on_fsrs_state"
    t.index ["learning_route_id", "position"], name: "idx_route_steps_on_route_and_position", unique: true
    t.index ["learning_route_id"], name: "index_learning_routes_engine_route_steps_on_learning_route_id"
    t.index ["level"], name: "index_learning_routes_engine_route_steps_on_level"
    t.index ["status"], name: "index_learning_routes_engine_route_steps_on_status"
  end

  create_table "route_requests", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "custom_topic"
    t.text "error_message"
    t.jsonb "goals", default: [], null: false
    t.uuid "learning_route_id"
    t.jsonb "learning_style_answers", default: {}, null: false
    t.jsonb "learning_style_result", default: {}, null: false
    t.string "level", null: false
    t.string "pace", null: false
    t.string "status", default: "pending", null: false
    t.jsonb "topics", default: [], null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["learning_route_id"], name: "index_route_requests_on_learning_route_id"
    t.index ["status"], name: "index_route_requests_on_status"
    t.index ["user_id", "created_at"], name: "index_route_requests_on_user_id_and_created_at"
    t.index ["user_id"], name: "index_route_requests_on_user_id"
  end

  add_foreign_key "assessments_assessment_results", "assessments_assessments", column: "assessment_id"
  add_foreign_key "assessments_questions", "assessments_assessments", column: "assessment_id"
  add_foreign_key "assessments_user_answers", "assessments_questions", column: "question_id"
  add_foreign_key "assessments_voice_responses", "assessments_assessment_results", column: "assessment_result_id"
  add_foreign_key "assessments_voice_responses", "core_users", column: "user_id"
  add_foreign_key "assessments_voice_responses", "learning_routes_engine_route_steps", column: "route_step_id"
  add_foreign_key "community_engine_activities", "core_users", column: "user_id"
  add_foreign_key "community_engine_comments", "community_engine_comments", column: "parent_id", on_delete: :cascade
  add_foreign_key "community_engine_comments", "core_users", column: "user_id"
  add_foreign_key "community_engine_follows", "core_users", column: "followed_id"
  add_foreign_key "community_engine_follows", "core_users", column: "follower_id"
  add_foreign_key "community_engine_likes", "core_users", column: "user_id"
  add_foreign_key "community_engine_notifications", "core_users", column: "actor_id"
  add_foreign_key "community_engine_notifications", "core_users", column: "user_id"
  add_foreign_key "community_engine_posts", "core_users", column: "user_id"
  add_foreign_key "community_engine_ratings", "community_engine_shared_routes", column: "shared_route_id"
  add_foreign_key "community_engine_ratings", "core_users", column: "user_id"
  add_foreign_key "community_engine_shared_routes", "core_users", column: "user_id"
  add_foreign_key "community_engine_shared_routes", "learning_routes_engine_learning_routes", column: "learning_route_id"
  add_foreign_key "core_sessions", "core_users", column: "user_id", on_delete: :cascade
  add_foreign_key "learning_routes_engine_knowledge_gaps", "learning_routes_engine_learning_routes", column: "learning_route_id"
  add_foreign_key "learning_routes_engine_learning_routes", "learning_routes_engine_learning_profiles", column: "learning_profile_id"
  add_foreign_key "learning_routes_engine_reinforcement_routes", "learning_routes_engine_knowledge_gaps", column: "knowledge_gap_id"
  add_foreign_key "learning_routes_engine_reinforcement_routes", "learning_routes_engine_learning_routes", column: "learning_route_id"
  add_foreign_key "learning_routes_engine_route_steps", "learning_routes_engine_learning_routes", column: "learning_route_id"
  add_foreign_key "route_requests", "core_users", column: "user_id"
  add_foreign_key "route_requests", "learning_routes_engine_learning_routes", column: "learning_route_id"
end
