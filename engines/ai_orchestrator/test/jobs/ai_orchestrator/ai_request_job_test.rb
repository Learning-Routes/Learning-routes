require "test_helper"

module AiOrchestrator
  class AiRequestJobTest < ActiveSupport::TestCase
    include ActiveJob::TestHelper

    test "job is queued in ai_requests queue" do
      assert_equal "ai_requests", AiRequestJob.new.queue_name
    end

    test "job class exists and is an ApplicationJob" do
      assert AiRequestJob < ApplicationJob
    end

    test "cost_alert_job is queued in default queue" do
      assert_equal "default", CostAlertJob.new.queue_name
    end

    test "cost alert job does not enqueue email without an owner" do
      Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
      violations = [{ type: "daily", current: 12_000, limit: 10_000 }]

      with_cost_alerts(violations) do
        assert_no_enqueued_jobs(only: ActionMailer::MailDeliveryJob) { CostAlertJob.perform_now }
      end
    end

    private

    def with_cost_alerts(violations)
      original = CostTracker.method(:check_alerts)
      CostTracker.define_singleton_method(:check_alerts) { violations }
      yield
    ensure
      CostTracker.define_singleton_method(:check_alerts, original)
    end
  end
end
