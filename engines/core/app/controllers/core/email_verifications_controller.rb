module Core
  class EmailVerificationsController < ApplicationController
    before_action :authenticate_user!, only: :resend

    def verify
      user = Core::User.find_by_token_for(:email_verification, params[:token])

      if user
        user.verify_email!
        redirect_to main_app.dashboard_path, notice: t("flash.email_verified")
      else
        redirect_to main_app.root_path, alert: t("flash.invalid_verification")
      end
    end

    def resend
      if current_user && !current_user.email_verified?
        Core::VerificationMailer.verify_email(current_user).deliver_later
        redirect_back fallback_location: main_app.dashboard_path,
                      notice: t("flash.verification_sent")
      else
        redirect_to main_app.dashboard_path
      end
    end
  end
end
