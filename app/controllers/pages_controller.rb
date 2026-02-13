class PagesController < Core::ApplicationController
  def home
    redirect_to dashboard_path if current_user
  end
end
