module Core
  class VerificationMailer < ApplicationMailer
    def verify_email(user)
      @user = user
      @token = user.generate_token_for(:email_verification)
      @url = core.verify_email_url(token: @token)

      mail(to: user.email, subject: I18n.t("verification_mailer.verify_email.subject", name: user.name))
    end
  end
end
