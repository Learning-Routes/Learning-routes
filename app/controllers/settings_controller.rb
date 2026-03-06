class SettingsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_user_and_profile

  def edit
  end

  def update
    @user.assign_attributes(user_params)
    @profile.assign_attributes(profile_params)

    # Require current password to change email (prevents session-hijack account takeover)
    if @user.will_save_change_to_email?
      unless @user.authenticate(params[:current_password].to_s)
        @user.errors.add(:base, t("settings.password_required_for_email"))
        return render :edit, status: :unprocessable_entity
      end
    end

    if @user.valid? && @profile.valid?
      email_changed = @user.will_save_change_to_email?

      ActiveRecord::Base.transaction do
        @user.save!
        @profile.save!
      end

      # Re-send verification email if email was changed
      if email_changed
        Core::VerificationMailer.verify_email(@user).deliver_later
      end

      # Sync locale cookie with DB value
      cookies[:locale] = { value: @user.locale, expires: 1.year.from_now }
      I18n.locale = @user.locale.to_sym

      # Sync theme cookie with DB value
      cookies[:theme] = { value: @user.theme, expires: 1.year.from_now }

      redirect_to settings_path, notice: email_changed ? t("settings.saved_verify_email") : t("settings.saved")
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
      # Invalidate all other sessions (keep current one)
      current_session_id = session[:core_session_id]
      @user.sessions.where.not(id: current_session_id).destroy_all

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
    params.require(:user).permit(:name, :email, :locale, :timezone, :theme)
  end

  def profile_params
    params.require(:learning_profile).permit(
      :current_level, :goal, :timeline,
      interests: [], learning_style: []
    )
  end
end
