module Admin
  class UsersController < BaseController
    def index
      @result = UserIndexQuery.new(
        search: params[:search], activity: params[:activity], route_state: params[:route_state], page: params[:page]
      ).call
    end

    def show
      @detail = UserDetailQuery.call(user_id: params[:id])
    end
  end
end
