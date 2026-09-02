module AiOrchestrator
  class AdminMailer < ApplicationMailer
    def cost_alert(violation, owner)
      @violation = violation
      mail(
        to: owner.email,
        subject: "[Cost Alert] AI spending #{violation[:type]} limit exceeded"
      )
    end
  end
end
