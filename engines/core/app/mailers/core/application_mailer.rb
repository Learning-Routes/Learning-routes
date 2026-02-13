module Core
  class ApplicationMailer < ActionMailer::Base
    default from: "noreply@learning-routes.com"
    layout "mailer"

    private

    def core
      Core::Engine.routes.url_helpers
    end
  end
end
