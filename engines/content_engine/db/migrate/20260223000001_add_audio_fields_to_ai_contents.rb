class AddAudioFieldsToAiContents < ActiveRecord::Migration[8.1]
  def change
    add_column :content_engine_ai_contents, :audio_status, :string, default: "pending", null: false
    add_column :content_engine_ai_contents, :audio_url, :string
    add_column :content_engine_ai_contents, :audio_duration, :float
    add_column :content_engine_ai_contents, :voice_id, :string
    add_column :content_engine_ai_contents, :audio_transcript, :text

    add_index :content_engine_ai_contents, :audio_status
  end
end
