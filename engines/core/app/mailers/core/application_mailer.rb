module Core
  class ApplicationMailer < ActionMailer::Base
    layout "mailer"

    private

    def core
      Core::Engine.routes.url_helpers
    end
  end
end
