module Core
  class SessionsController < ApplicationController
    rate_limit to: 10, within: 3.minutes, only: :create, with: -> {
      redirect_to core.sign_in_path, alert: "Too many login attempts. Please try again later."
    }

    before_action :redirect_if_signed_in, only: [:new, :create]

    def new
    end

    def create
      user = Core::User.find_by(email: params[:email].to_s.strip.downcase)

      if user&.authenticate(params[:password])
        start_session_for(user, remember: params[:remember_me] == "1")
        redirect_to after_sign_in_path(user), notice: "Signed in successfully."
      else
        flash.now[:alert] = "Invalid email or password."
        render :new, status: :unprocessable_entity
      end
    end

    def destroy
      end_session
      redirect_to core.sign_in_path, notice: "Signed out successfully."
    end

    private

    def redirect_if_signed_in
      redirect_to main_app.dashboard_path if current_user
    end
  end
end
