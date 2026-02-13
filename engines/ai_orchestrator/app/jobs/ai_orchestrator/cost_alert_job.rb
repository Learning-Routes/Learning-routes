module AiOrchestrator
  class CostAlertJob < ApplicationJob
    queue_as :default

    def perform
      violations = CostTracker.check_alerts

      violations.each do |violation|
        Rails.logger.error(
          "[AiOrchestrator::CostAlert] #{violation[:type]} exceeded: " \
          "#{violation[:current]} cents (limit: #{violation[:limit]} cents)"
        )

        # TODO: Send notification email to admin when mailer is set up
        # AdminMailer.cost_alert(violation).deliver_later
      end
    end
  end
end
