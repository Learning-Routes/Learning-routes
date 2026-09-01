module Admin
  class UsersController < BaseController
    def index
      render plain: "Owner users"
    end

    def show
      render plain: "Owner user"
    end
  end
end
