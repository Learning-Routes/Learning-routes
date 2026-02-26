CommunityEngine::Engine.routes.draw do
  # Comments (polymorphic)
  resources :comments, only: [:create, :update, :destroy]

  # Likes (toggle)
  post "likes/toggle", to: "likes#toggle", as: :toggle_like

  # Follows
  resources :follows, only: [:create, :destroy]

  # Feed
  get "feed", to: "feed#index", as: :feed
  get "feed/following", to: "feed#following", as: :feed_following
  get "feed/trending", to: "feed#trending", as: :feed_trending

  # Notifications
  resources :notifications, only: [:index] do
    collection do
      post :mark_all_read
      get :unread_count
    end
    member do
      patch :mark_read
    end
  end

  # Posts
  resources :posts, only: [:create, :destroy]

  # Shared Routes
  resources :shared_routes, only: [:create, :show, :destroy] do
    member do
      post :clone
      post :rate, to: "ratings#create"
    end
  end
end
