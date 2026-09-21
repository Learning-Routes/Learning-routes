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
        # The film and its captions. Member routes on :steps so the path carries the
        # route AND the step — which is exactly the pair ModuleAccessPolicy is asked
        # about — and so `params[:id]` is the step id the inherited callbacks in
        # StepMediaController already read.
        get :video, to: "step_media#video"
        get :subtitles, to: "step_media#subtitles"
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
