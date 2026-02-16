class AddRouteStepToAnalyticsStudySessions < ActiveRecord::Migration[8.1]
  def change
    add_reference :analytics_study_sessions, :route_step, type: :uuid, index: true, null: true
  end
end
