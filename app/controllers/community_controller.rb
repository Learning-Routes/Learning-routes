class CommunityController < ApplicationController
  def show
    redirect_to community_engine.feed_path
  end
end
