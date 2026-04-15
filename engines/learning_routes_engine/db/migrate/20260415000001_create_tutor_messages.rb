# frozen_string_literal: true

class CreateTutorMessages < ActiveRecord::Migration[8.1]
  def change
    create_table :learning_routes_engine_tutor_messages, id: :uuid do |t|
      t.uuid :user_id, null: false
      t.uuid :step_id, null: false
      t.string :role, null: false, default: "user"
      t.text :content, null: false
      t.jsonb :metadata, default: {}
      t.timestamps
    end

    add_index :learning_routes_engine_tutor_messages, [:user_id, :step_id]
    add_index :learning_routes_engine_tutor_messages, :created_at
  end
end
