class ThemeController < ApplicationController
  def update
    theme = params[:theme].to_s
    if theme.in?(Core::User::VALID_THEMES)
      cookies[:theme] = { value: theme, expires: 1.year.from_now }
      current_user&.update(theme: theme)
    end

    respond_to do |format|
      format.turbo_stream { head :ok }
      format.html { redirect_back fallback_location: root_path, allow_other_host: false }
    end
  end
end
