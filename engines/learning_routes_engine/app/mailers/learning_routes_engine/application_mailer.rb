module LearningRoutesEngine
  class ApplicationMailer < ActionMailer::Base
    default from: "noreply@learning-routes.com"
    layout "mailer"
  end
end
