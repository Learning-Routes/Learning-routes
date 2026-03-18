Core::Engine.routes.draw do
  # Registration
  get  "sign_up",  to: "registrations#new", as: :sign_up
  post "sign_up",  to: "registrations#create"

  # Sessions
  get    "sign_in",  to: "sessions#new", as: :sign_in
  post   "sign_in",  to: "sessions#create"
  delete "sign_out", to: "sessions#destroy", as: :sign_out

  # Password reset
  get   "forgot_password", to: "passwords#forgot", as: :forgot_password
  post  "forgot_password", to: "passwords#create"
  get   "reset_password/:token", to: "passwords#reset", as: :reset_password
  patch "reset_password/:token", to: "passwords#update"

  # Email verification
  get  "verify_email/:token", to: "email_verifications#verify", as: :verify_email
  post "resend_verification", to: "email_verifications#resend", as: :resend_verification
  get  "verify_pending",      to: "email_verifications#pending", as: :verify_pending

  # OAuth callbacks
  get  "auth/google_oauth2/callback", to: "omniauth_callbacks#google_oauth2", as: :google_oauth2_callback
  get  "auth/failure",                to: "omniauth_callbacks#failure",        as: :oauth_failure

  # Onboarding
  get   "onboarding", to: "onboarding#show", as: :onboarding
  patch "onboarding/:step", to: "onboarding#update_step", as: :onboarding_update_step
  get   "onboarding/complete", to: "onboarding#complete", as: :complete_onboarding
end
