ContentEngine::Engine.routes.draw do
  resources :lessons, only: [] do
    member do
      post :explain_differently
      post :give_example
      post :simplify
      post :deepen
    end
  end

  resources :exercises, only: [] do
    member do
      post :submit_answer
      post :get_hint
      post :run_code
    end
  end

  resources :notes, only: [:create, :update, :destroy]

  # Audio content endpoints
  resources :audio, only: [:show] do
    member do
      post :generate
      get :status
    end
  end
end
