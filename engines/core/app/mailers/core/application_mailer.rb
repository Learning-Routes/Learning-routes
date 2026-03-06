module Core
  class ApplicationMailer < ActionMailer::Base
    default from: "noreply@learningroutes.com"
    layout "mailer"

    private

    def core
      Core::Engine.routes.url_helpers
    end
  end
end
