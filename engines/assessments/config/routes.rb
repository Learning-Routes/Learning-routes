Assessments::Engine.routes.draw do
  resources :assessments, only: [:show] do
    member do
      post :start
    end
    resources :answers, only: [:create]
  end

  resources :results, only: [:show] do
    member do
      post :submit
    end
  end

  # Voice response endpoints
  resources :voice_responses, only: [:create, :show]
end
