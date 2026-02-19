class SettingsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_user_and_profile

  def edit
  end

  def update
    @user.assign_attributes(user_params)
    @profile.assign_attributes(profile_params)

    if @user.valid? && @profile.valid?
      ActiveRecord::Base.transaction do
        @user.save!
        @profile.save!
      end

      # Sync locale cookie with DB value
      cookies[:locale] = { value: @user.locale, expires: 1.year.from_now }
      I18n.locale = @user.locale.to_sym

      redirect_to settings_path, notice: t("settings.saved")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def update_password
    unless @user.authenticate(params[:current_password].to_s)
      @user.errors.add(:base, t("settings.wrong_current_password"))
      return render :edit, status: :unprocessable_entity
    end

    if @user.update(password: params[:new_password], password_confirmation: params[:new_password_confirmation])
      redirect_to settings_path, notice: t("settings.password_updated")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  private

  def set_user_and_profile
    @user = current_user
    @profile = LearningRoutesEngine::LearningProfile.find_or_initialize_by(user: @user)
  end

  def user_params
    params.require(:user).permit(:name, :email, :locale, :timezone)
  end

  def profile_params
    params.require(:learning_profile).permit(
      :current_level, :goal, :timeline,
      interests: [], learning_style: []
    )
  end
end
