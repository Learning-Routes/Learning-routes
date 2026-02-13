Rails.application.routes.draw do
  # Engine mounts
  mount Core::Engine => "/", as: "core"
  mount LearningRoutesEngine::Engine => "/learning", as: "learning_routes_engine"
  mount ContentEngine::Engine => "/content", as: "content_engine"
  mount Assessments::Engine => "/assessments", as: "assessments"
  mount AiOrchestrator::Engine => "/ai", as: "ai_orchestrator"
  mount Analytics::Engine => "/analytics", as: "analytics"

  # Health check endpoint for load balancers and uptime monitors
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/*
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Root path (will be landing page)
  # root "pages#home"
end
