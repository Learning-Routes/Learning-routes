module Core
  class EmailVerificationsController < ApplicationController
    rate_limit to: 5, within: 5.minutes, only: :resend, with: -> { redirect_back fallback_location: main_app.dashboard_path, alert: t("flash.rate_limited") }
    before_action :authenticate_user!, only: [:resend, :pending]
    skip_before_action :require_email_verification!

    layout "auth"

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
        begin
          Core::VerificationMailer.verify_email(current_user).deliver_now
          redirect_back fallback_location: core.verify_pending_path,
                        notice: t("flash.verification_sent")
        rescue => e
          Rails.logger.error("[EMAIL FAILURE] Resend verification for #{current_user.email}: #{e.class}: #{e.message}")
          redirect_back fallback_location: core.verify_pending_path,
                        alert: t("flash.email_delivery_failed")
        end
      else
        redirect_to main_app.dashboard_path
      end
    end

    def pending
      redirect_to main_app.dashboard_path if current_user.email_verified?
    end
  end
end
