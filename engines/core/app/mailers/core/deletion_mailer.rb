module Core
  class DeletionMailer < ApplicationMailer
    def route_deletion_code(user, route, code)
      @user = user
      @route = route
      @code = code

      mail(to: user.email, subject: I18n.t("deletion_mailer.route_deletion_code.subject"))
    rescue => e
      Rails.logger.error("[EMAIL FAILURE] DeletionMailer#route_deletion_code to=#{user.email} error=#{e.class}: #{e.message}")
      raise
    end
  end
end
