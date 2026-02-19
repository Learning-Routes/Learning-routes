class PagesController < ApplicationController
  layout "landing"

  def home
    redirect_to dashboard_path if current_user
  end

  def terms; end
  def privacy; end
end
