class AddAudioErrorMessageToAiContents < ActiveRecord::Migration[8.1]
  def change
    add_column :content_engine_ai_contents, :audio_error_message, :text
  end
end
