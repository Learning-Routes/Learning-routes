module AiOrchestrator
  class CostAlertJob < ApplicationJob
    queue_as :default
    retry_on StandardError, wait: :polynomially_longer, attempts: 3

    def perform
      violations = CostTracker.check_alerts
      owner = Core::User.find_by(role: :owner)

      violations.each do |violation|
        Rails.logger.error(
          "[AiOrchestrator::CostAlert] #{violation[:type]} exceeded: " \
          "#{violation[:current]} cents (limit: #{violation[:limit]} cents)"
        )

        AdminMailer.cost_alert(violation, owner).deliver_later if owner
      end
    end
  end
end
