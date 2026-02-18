Rails.application.routes.draw do
  # Engine mounts
  mount Core::Engine => "/", as: "core"
  mount LearningRoutesEngine::Engine => "/learning", as: "learning_routes_engine"
  mount ContentEngine::Engine => "/content", as: "content_engine"
  mount Assessments::Engine => "/assessments", as: "assessments"
  mount AiOrchestrator::Engine => "/ai", as: "ai_orchestrator"
  mount Analytics::Engine => "/analytics", as: "analytics"

  # Dashboard
  get "dashboard", to: redirect("/profile"), as: :dashboard

  # Profile
  get "profile", to: "profiles#show", as: :profile

  # Route Wizard (Create Route)
  get "routes/create", to: "route_wizard#new", as: :new_route_wizard
  post "routes/create", to: "route_wizard#create", as: :create_route_wizard
  get "routes/create/status/:id", to: "route_wizard#status", as: :route_wizard_status

  # Community
  get "community", to: "community#show", as: :community

  # Health check endpoint for load balancers and uptime monitors
  get "up" => "rails/health#show", as: :rails_health_check

  # Root path
  root "landing#index"
end
