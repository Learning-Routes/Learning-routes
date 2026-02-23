class CreateAssessmentsVoiceResponses < ActiveRecord::Migration[8.1]
  def change
    create_table :assessments_voice_responses, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :route_step_id, null: false
      t.uuid :user_id, null: false
      t.uuid :assessment_result_id
      t.string :audio_blob_key
      t.text :transcription
      t.jsonb :ai_evaluation, default: {}
      t.integer :score
      t.string :status, default: "pending", null: false

      t.timestamps
    end

    add_index :assessments_voice_responses, :route_step_id
    add_index :assessments_voice_responses, :user_id
    add_index :assessments_voice_responses, :status
    add_index :assessments_voice_responses, [:user_id, :route_step_id], name: "idx_voice_responses_user_step"

    add_foreign_key :assessments_voice_responses, :learning_routes_engine_route_steps, column: :route_step_id
    add_foreign_key :assessments_voice_responses, :core_users, column: :user_id
  end
end
