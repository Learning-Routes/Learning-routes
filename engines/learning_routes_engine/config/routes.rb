LearningRoutesEngine::Engine.routes.draw do
  resources :routes, only: [:show] do
    resources :steps, only: [:show] do
      member do
        post :complete
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
