class AddMissingQueryIndexes < ActiveRecord::Migration[8.1]
  def change
    # assessment_results: for_user().recent() scope chain (profiles_controller)
    add_index :assessments_assessment_results, [:user_id, :created_at],
              name: "idx_assessment_results_user_timeline"

    # user_engagements: daily streak reset job filters on this boolean
    add_index :user_engagements, :streak_freeze_used_today,
              where: "streak_freeze_used_today = true",
              name: "idx_user_engagements_streak_freeze_active"

    # comments: resource-specific feeds ordered by recency (feed_controller)
    add_index :community_engine_comments, [:commentable_type, :commentable_id, :created_at],
              name: "idx_comments_commentable_timeline"

    # activities: feed queries filter by action + user + time (activity_tracker dedup)
    add_index :community_engine_activities, [:user_id, :action, :created_at],
              name: "idx_activities_user_action_timeline"
  end
end
