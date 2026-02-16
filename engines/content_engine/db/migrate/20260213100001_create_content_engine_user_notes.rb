class CreateContentEngineUserNotes < ActiveRecord::Migration[8.1]
  def change
    create_table :content_engine_user_notes, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, index: true
      t.references :route_step, null: false, type: :uuid, index: true
      t.text :body, null: false

      t.timestamps
    end

    add_index :content_engine_user_notes, [:user_id, :route_step_id],
              name: "idx_user_notes_on_user_and_step"
  end
end
