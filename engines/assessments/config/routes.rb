Assessments::Engine.routes.draw do
  resources :assessments, only: [:show] do
    member do
      # POST mutates and redirects; GET renders. Splitting these is the whole of
      # WP-26 §1: `start` used to RENDER the exam from the POST, and Turbo
      # refuses a form response that is not a redirect or a turbo_stream
      # ("Form responses must redirect to another location"), so the button
      # threw the page away and nothing moved. It also meant a refresh re-POSTed
      # and re-ran AssessmentResult.create! and the StudySession upsert.
      post :start
      get :take
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
