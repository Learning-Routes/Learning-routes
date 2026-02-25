class FixVoiceResponsesConstraints < ActiveRecord::Migration[8.1]
  def change
    change_column_null :assessments_voice_responses, :audio_blob_key, false
    add_index :assessments_voice_responses, :assessment_result_id
    add_foreign_key :assessments_voice_responses, :assessments_assessment_results, column: :assessment_result_id
  end
end
