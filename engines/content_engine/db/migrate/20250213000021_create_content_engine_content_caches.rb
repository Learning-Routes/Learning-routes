class CreateContentEngineContentCaches < ActiveRecord::Migration[8.1]
  def change
    create_table :content_engine_content_caches, id: :uuid do |t|
      t.string :cache_key, null: false
      t.text :content, null: false
      t.string :content_type
      t.jsonb :metadata, default: {}
      t.datetime :expires_at

      t.timestamps
    end

    add_index :content_engine_content_caches, :cache_key, unique: true
    add_index :content_engine_content_caches, :expires_at
  end
end
