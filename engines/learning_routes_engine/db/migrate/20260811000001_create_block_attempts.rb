# frozen_string_literal: true

# One row per (user, step, lesson section) recording what the student submitted to an
# interactive block and what the server made of it.
#
# WHY A NEW TABLE (see WP10_DESIGN.md §1):
#   * assessments_user_answers is keyed to question_id with unique(user_id, question_id),
#     and a lesson block is not an Assessments::Question. Synthesising one per block
#     would put lesson content in the assessments domain and give no stable identity.
#   * route_steps.metadata is unqueryable, and — decisively — MediaPrefetchJob rewrites
#     metadata["parsed_sections"] after generation, so student results stored there sit
#     in a structure the pipeline overwrites.
class CreateBlockAttempts < ActiveRecord::Migration[8.1]
  def change
    create_table :learning_routes_engine_block_attempts, id: :uuid do |t|
      t.references :user, type: :uuid, null: false,
                   foreign_key: { to_table: :core_users, on_delete: :cascade },
                   index: false
      t.references :route_step, type: :uuid, null: false,
                   foreign_key: { to_table: :learning_routes_engine_route_steps, on_delete: :cascade },
                   index: false

      # Position within step.metadata["parsed_sections"]. Stable for the life of the
      # content — MediaPrefetchJob mutates entries in place by index — but NOT across a
      # regeneration, which is why block_type is stored and re-checked on read.
      t.integer :section_index, null: false
      t.string  :block_type,    null: false

      t.jsonb   :payload, default: {}, null: false   # what the student submitted

      # NULL when the block is not objectively gradable (scenario, simulation,
      # code_playground). Those record engagement only — see WP10_DESIGN.md §2.
      t.boolean :correct
      t.decimal :score, precision: 5, scale: 2

      t.integer  :attempts, default: 0, null: false
      t.datetime :completed_at

      # Set when a correctness-gated block stopped gating after RELEASE_AFTER failures.
      # Deliberately NOT the same thing as passing: a released block is a signal that the
      # answer key is probably wrong, and it must never read as a success downstream.
      t.datetime :released_at

      t.timestamps
    end

    add_index :learning_routes_engine_block_attempts,
              %i[user_id route_step_id section_index],
              unique: true, name: "idx_block_attempts_unique_per_section"
    add_index :learning_routes_engine_block_attempts, :route_step_id,
              name: "idx_block_attempts_on_route_step"
    add_index :learning_routes_engine_block_attempts, %i[user_id completed_at],
              name: "idx_block_attempts_user_timeline"
    add_index :learning_routes_engine_block_attempts, :released_at,
              where: "released_at IS NOT NULL",
              name: "idx_block_attempts_released"
  end
end
