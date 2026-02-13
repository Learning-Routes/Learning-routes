class CreateContentEngineAiContents < ActiveRecord::Migration[8.1]
  def change
    create_table :content_engine_ai_contents, id: :uuid do |t|
      t.references :route_step, null: false, type: :uuid, index: true
      t.integer :content_type, default: 0, null: false
      t.text :body
      t.string :audio_url
      t.string :image_url
      t.jsonb :metadata, default: {}
      t.string :ai_model
      t.integer :tokens_used, default: 0
      t.decimal :generation_cost, precision: 10, scale: 4, default: 0
      t.boolean :cached, default: false, null: false

      t.timestamps
    end

    add_index :content_engine_ai_contents, :content_type
    add_index :content_engine_ai_contents, :ai_model
    add_index :content_engine_ai_contents, :cached
  end
end
