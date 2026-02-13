Rails.application.routes.draw do
  # Engine mounts
  mount Core::Engine => "/", as: "core"
  mount LearningRoutesEngine::Engine => "/learning", as: "learning_routes_engine"
  mount ContentEngine::Engine => "/content", as: "content_engine"
  mount Assessments::Engine => "/assessments", as: "assessments"
  mount AiOrchestrator::Engine => "/ai", as: "ai_orchestrator"
  mount Analytics::Engine => "/analytics", as: "analytics"

  # Dashboard
  get "dashboard", to: "dashboard#show", as: :dashboard

  # Health check endpoint for load balancers and uptime monitors
  get "up" => "rails/health#show", as: :rails_health_check

  # Root path
  root "pages#home"
end
