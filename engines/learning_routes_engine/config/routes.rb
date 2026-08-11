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
      # Interactive block submissions, graded server-side. section_index addresses the
      # entry in step.metadata["parsed_sections"].
      post "blocks/:section_index", to: "block_attempts#create", as: :block_attempt
      resources :tutor_chats, only: [:index, :create]
    end
  end

  resources :reviews, only: [:index] do
    member do
      post :submit_review
    end
  end
end
