class AddLearningStyleToRouteRequests < ActiveRecord::Migration[8.1]
  def change
    add_column :route_requests, :learning_style_answers, :jsonb, default: {}, null: false
    add_column :route_requests, :learning_style_result, :jsonb, default: {}, null: false
  end
end
