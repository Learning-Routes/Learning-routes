module Core
  class PasswordMailer < ApplicationMailer
    def reset_password(user)
      @user = user
      @token = user.generate_token_for(:password_reset)
      @url = core.reset_password_url(token: @token)

      mail(to: user.email, subject: I18n.t("password_mailer.reset_password.subject"))
    end
  end
end
