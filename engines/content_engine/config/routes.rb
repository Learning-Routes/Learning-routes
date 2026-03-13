ContentEngine::Engine.routes.draw do
  resources :lessons, only: [] do
    member do
      post :explain_differently
      post :give_example
      post :simplify
      post :deepen
      post :interact
    end
  end

  resources :exercises, only: [] do
    member do
      post :submit_answer
      post :get_hint
      post :run_code
    end
  end

  # On-demand image generation for visual sections
  scope "section_images/:step_id/:section_index", controller: :section_images, as: :section_image do
    post :generate, action: :generate
  end

  resources :notes, only: [:create, :update, :destroy]

  # Audio content endpoints
  resources :audio, only: [:show] do
    member do
      post :generate
      get :status
    end
  end

  # Per-section audio endpoints
  scope "section_audio/:step_id/:section_index", controller: :section_audio, as: :section_audio do
    post :generate, action: :generate
    get :status, action: :status
    get :show, action: :show
  end
end
