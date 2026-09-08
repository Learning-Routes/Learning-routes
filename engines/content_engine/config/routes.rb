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

  # `submit_answer` and `get_hint` retired with the exercise code editor
  # (WP-35 §3). `run_code` is a placeholder with no caller — the `## Playground`
  # block runs Pyodide in the browser — but it costs nothing and
  # `module_lock_authorization_test` asserts a locked module cannot reach it, so
  # it stays rather than being quietly deleted along with the two that had to go.
  resources :exercises, only: [] do
    member do
      post :run_code
    end
  end

  # On-demand image generation for visual sections
  scope "section_images/:step_id/:section_index", controller: :section_images, as: :section_image do
    post :generate, action: :generate
    # Polled while SectionImageJob runs; generation is async because it takes 30-90s.
    get :status, action: :status
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
