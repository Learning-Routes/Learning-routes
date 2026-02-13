require "test_helper"

module AiOrchestrator
  class AiRequestJobTest < ActiveSupport::TestCase
    test "job is queued in ai_requests queue" do
      assert_equal "ai_requests", AiRequestJob.new.queue_name
    end

    test "job class exists and is an ApplicationJob" do
      assert AiRequestJob < ApplicationJob
    end

    test "cost_alert_job is queued in default queue" do
      assert_equal "default", CostAlertJob.new.queue_name
    end
  end
end
