module Core
  class PasswordsController < ApplicationController
    rate_limit to: 5, within: 5.minutes, only: :create, with: -> {
      redirect_to core.forgot_password_path, alert: "Too many requests. Please try again later."
    }

    def forgot
    end

    def create
      user = Core::User.find_by(email: params[:email].to_s.strip.downcase)
      if user
        Core::PasswordMailer.reset_password(user).deliver_later
      end
      # Always show success to prevent email enumeration
      redirect_to core.sign_in_path, notice: "If that email exists, we sent password reset instructions."
    end

    def reset
      @user = Core::User.find_by_token_for(:password_reset, params[:token])
      unless @user
        redirect_to core.forgot_password_path, alert: "Invalid or expired reset link."
      end
    end

    def update
      @user = Core::User.find_by_token_for(:password_reset, params[:token])
      unless @user
        redirect_to core.forgot_password_path, alert: "Invalid or expired reset link."
        return
      end

      if @user.update(password_params)
        @user.sessions.destroy_all
        redirect_to core.sign_in_path, notice: "Password updated. Please sign in."
      else
        render :reset, status: :unprocessable_entity
      end
    end

    private

    def password_params
      params.require(:user).permit(:password, :password_confirmation)
    end
  end
end
