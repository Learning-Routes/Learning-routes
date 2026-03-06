module Core
  class RegistrationsController < ApplicationController
    layout "auth"
    rate_limit to: 5, within: 3.minutes, only: :create, with: -> {
      redirect_to core.sign_up_path, alert: I18n.t("flash.too_many_requests")
    }
    before_action :redirect_if_signed_in, only: [:new, :create]

    def new
      @user = Core::User.new
    end

    def create
      @user = Core::User.new(registration_params)
      @user.role = :student

      if @user.save
        Core::VerificationMailer.verify_email(@user).deliver_later
        start_session_for(@user)
        redirect_to after_sign_in_path(@user), notice: t("flash.welcome")
      else
        render :new, status: :unprocessable_entity
      end
    end

    private

    def registration_params
      params.require(:user).permit(:name, :email, :password, :password_confirmation)
    end

    def redirect_if_signed_in
      if current_user
        redirect_to main_app.dashboard_path
        return
      end
    end
  end
end
