module AiOrchestrator
  class AdminMailer < ApplicationMailer
    ADMIN_EMAIL = "admin@learning-routes.com".freeze

    def cost_alert(violation)
      @violation = violation
      mail(
        to: ADMIN_EMAIL,
        subject: "[Cost Alert] AI spending #{violation[:type]} limit exceeded"
      )
    end
  end
end
