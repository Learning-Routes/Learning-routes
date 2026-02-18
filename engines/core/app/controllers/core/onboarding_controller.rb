module Core
  class OnboardingController < ApplicationController
    layout "onboarding"

    before_action :authenticate_user!
    before_action :redirect_if_onboarded, except: :complete
    before_action :set_or_build_profile

    STEPS = %w[interests level learning_style goal].freeze
    STEP_LABELS = { "interests" => "Topic", "level" => "Level", "learning_style" => "Style", "goal" => "Goal" }.freeze

    def show
      @step = current_step
      @step_number = STEPS.index(@step) + 1
      @total_steps = STEPS.size
      @step_label = STEP_LABELS[@step]
      return render partial: "core/onboarding/step_#{@step}", locals: { profile: @profile } if turbo_frame_request?
    end

    def update_step
      @step = params[:step]
      return redirect_to core.onboarding_path unless @step.in?(STEPS)

      case @step
      when "interests"
        interests = Array(params[:interests]).reject(&:blank?)
        custom = params[:custom_interest].to_s.strip
        interests << custom if custom.present?
        if interests.empty?
          @profile.errors.add(:interests, "please select at least one topic")
          return render_step_error
        end
        @profile.interests = interests
      when "level"
        @profile.current_level = params[:current_level]
      when "learning_style"
        styles = Array(params[:learning_style]).reject(&:blank?)
        if styles.empty?
          @profile.errors.add(:learning_style, "please select at least one style")
          return render_step_error
        end
        @profile.learning_style = styles
      when "goal"
        goal = params[:goal].to_s.strip
        timeline = params[:timeline].to_s
        if goal.blank?
          @profile.errors.add(:goal, "can't be blank")
          return render_step_error
        end
        if goal.length > 500
          @profile.errors.add(:goal, "is too long (maximum 500 characters)")
          return render_step_error
        end
        unless timeline.in?(%w[1_month 3_months 6_months 1_year])
          @profile.errors.add(:timeline, "please select a timeline")
          return render_step_error
        end
        @profile.goal = goal
        @profile.timeline = timeline
      end

      if @profile.save
        next_step = next_step_after(@step)
        if next_step
          redirect_to core.onboarding_path(step: next_step)
        else
          redirect_to core.complete_onboarding_path
        end
      else
        render_step_error
      end
    end

    def complete
      current_user.complete_onboarding!
      RouteGenerationPlaceholderJob.perform_later(current_user.id) if defined?(RouteGenerationPlaceholderJob)
      redirect_to main_app.profile_path, notice: "Welcome aboard! We're creating your personalized learning route."
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

    def render_step_error
      @step_number = STEPS.index(@step) + 1
      @total_steps = STEPS.size
      @step_label = STEP_LABELS[@step]
      render partial: "core/onboarding/step_#{@step}", locals: { profile: @profile }, status: :unprocessable_entity
    end

    def redirect_if_onboarded
      redirect_to main_app.profile_path if current_user.onboarding_completed?
    end
  end
end
