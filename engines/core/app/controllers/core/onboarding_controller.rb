module Core
  class OnboardingController < ApplicationController
    before_action :authenticate_user!
    before_action :redirect_if_onboarded, except: :complete
    before_action :set_or_build_profile

    STEPS = %w[interests level learning_style goal].freeze

    def show
      @step = current_step
      @step_number = STEPS.index(@step) + 1
      @total_steps = STEPS.size
      render partial: "core/onboarding/step_#{@step}", locals: { profile: @profile } if turbo_frame_request?
    end

    def update_step
      @step = params[:step]
      return redirect_to core.onboarding_path unless @step.in?(STEPS)

      case @step
      when "interests"
        interests = Array(params[:interests]).reject(&:blank?)
        custom = params[:custom_interest].to_s.strip
        interests << custom if custom.present?
        @profile.interests = interests
      when "level"
        @profile.current_level = params[:current_level]
      when "learning_style"
        @profile.learning_style = Array(params[:learning_style]).reject(&:blank?)
      when "goal"
        @profile.goal = params[:goal].to_s.strip
        @profile.timeline = params[:timeline]
      end

      if @profile.save
        next_step = next_step_after(@step)
        if next_step
          redirect_to core.onboarding_path(step: next_step)
        else
          redirect_to core.complete_onboarding_path
        end
      else
        @step_number = STEPS.index(@step) + 1
        @total_steps = STEPS.size
        render partial: "core/onboarding/step_#{@step}", locals: { profile: @profile }, status: :unprocessable_entity
      end
    end

    def complete
      current_user.complete_onboarding!
      RouteGenerationPlaceholderJob.perform_later(current_user.id) if defined?(RouteGenerationPlaceholderJob)
      redirect_to main_app.dashboard_path, notice: "Welcome aboard! We're creating your personalized learning route."
    end

    private

    def current_step
      step = params[:step].to_s
      step.in?(STEPS) ? step : STEPS.first
    end

    def next_step_after(step)
      idx = STEPS.index(step)
      STEPS[idx + 1] if idx
    end

    def set_or_build_profile
      @profile = LearningRoutesEngine::LearningProfile.find_or_initialize_by(user: current_user)
    end

    def redirect_if_onboarded
      redirect_to main_app.dashboard_path if current_user.onboarding_completed?
    end
  end
end
