class AddSpacedRepetitionToRouteSteps < ActiveRecord::Migration[8.1]
  def change
    change_table :learning_routes_engine_route_steps do |t|
      # FSRS v4 spaced repetition fields
      t.float :fsrs_stability, default: 0.0
      t.float :fsrs_difficulty, default: 0.0
      t.integer :fsrs_reps, default: 0
      t.integer :fsrs_lapses, default: 0
      t.integer :fsrs_state, default: 0  # 0=New, 1=Learning, 2=Review, 3=Relearning
      t.datetime :fsrs_last_review_at
      t.datetime :fsrs_next_review_at
      t.float :fsrs_elapsed_days, default: 0.0
      t.float :fsrs_scheduled_days, default: 0.0

      # Prerequisites and metadata
      t.jsonb :prerequisites, default: []
      t.jsonb :metadata, default: {}
    end

    add_index :learning_routes_engine_route_steps, :fsrs_next_review_at,
              name: "idx_route_steps_on_fsrs_next_review"
    add_index :learning_routes_engine_route_steps, :fsrs_state,
              name: "idx_route_steps_on_fsrs_state"
  end
end
