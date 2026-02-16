LearningRoutesEngine::Engine.routes.draw do
  resources :routes, only: [:show] do
    resources :steps, only: [:show] do
      member do
        post :complete
      end
    end
  end

  resources :reviews, only: [:index] do
    member do
      post :submit_review
    end
  end
end
