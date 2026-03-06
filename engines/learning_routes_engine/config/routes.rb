LearningRoutesEngine::Engine.routes.draw do
  resources :routes, only: [:show] do
    member do
      get :journey
      post :request_deletion
      delete :confirm_deletion
    end
    resources :steps, only: [:show] do
      member do
        post :complete
        get :content_status
      end
      resource :step_quiz, only: [], controller: "step_quizzes" do
        post :submit
        post :retry_quiz
        get :check_status
      end
    end
  end

  resources :reviews, only: [:index] do
    member do
      post :submit_review
    end
  end
end
