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
end
