class RouteWizardController < ApplicationController
  before_action :authenticate_user!

  def new
    @existing_request = current_user.route_requests.pending_or_generating.first
    if @existing_request&.generating?
      @route_request = @existing_request
      @generating = true
    else
      @route_request = RouteRequest.new
      @generating = false
    end

    # Load saved learning preferences for pre-fill
    @saved_profile = current_user.learning_profile
  end

  def create
    @route_request = current_user.route_requests.new(wizard_params)

    if @route_request.save
      # Save learning preferences to profile for future wizard visits
      save_preferences_to_profile(@route_request)

      WizardRouteGenerationJob.perform_later(@route_request.id)

      respond_to do |format|
        format.turbo_stream {
          render turbo_stream: turbo_stream.replace(
            "wizard-container",
            partial: "route_wizard/generating",
            locals: { route_request: @route_request }
          )
        }
        format.html { redirect_to new_route_wizard_path }
      end
    else
      error_msg = @route_request.errors.full_messages.join(". ")
      respond_to do |format|
        format.turbo_stream {
          render turbo_stream: turbo_stream.replace("wizard-error-banner") {
            tag.div(id: "wizard-error-banner", "data-route-wizard-target": "errorBanner",
              style: "max-width:640px; width:100%; margin-bottom:10px; padding:10px 16px; border-radius:10px; background:rgba(176,96,80,0.08); border:1px solid rgba(176,96,80,0.15); font-family:'DM Sans',sans-serif; font-size:0.78rem; color:#B06050;") {
              error_msg
            }
          }
        }
        format.html {
          flash.now[:alert] = error_msg
          render :new, status: :unprocessable_entity
        }
      end
    end
  end

  def status
    request_record = current_user.route_requests.find(params[:id])

    case request_record.status
    when "completed"
      render json: {
        status: "completed",
        redirect_url: profile_path
      }
    when "failed"
      render json: {
        status: "failed",
        error: request_record.error_message || t("flash.route_generation_failed")
      }
    when "generating"
      render json: { status: "generating" }
    else
      render json: { status: "pending" }
    end
  end

  private

  def wizard_params
    params.require(:route_request).permit(
      :custom_topic, :level, :pace, :weekly_hours, :session_minutes,
      topics: [], goals: [],
      learning_style_answers: {}
    ).tap do |p|
      p[:topics] = p[:topics]&.reject(&:blank?) || []
      p[:goals] = p[:goals]&.reject(&:blank?) || []
      if p[:learning_style_answers].present?
        p[:learning_style_answers] = p[:learning_style_answers].reject { |_, v| v.blank? }
      end
    end
  end

  def save_preferences_to_profile(request)
    profile = LearningRoutesEngine::LearningProfile.find_or_initialize_by(user: current_user)
    profile.current_level ||= map_level_for_profile(request.level)

    # Save learning style if answered
    if request.learning_style_answers.present? && request.learning_style_answers.keys.length == 6
      profile.saved_style_answers = request.learning_style_answers
      profile.saved_style_result = request.learning_style_result if request.learning_style_result.present?
      profile.learning_style = request.learning_style_result&.dig("dominant")
    end

    # Save other preferences
    profile.preferred_pace = request.pace if request.pace.present?
    profile.preferred_goals = request.goals if request.goals.present?
    profile.weekly_hours = request.weekly_hours if request.weekly_hours.present?
    profile.session_minutes = request.session_minutes if request.session_minutes.present?

    profile.save
  rescue => e
    Rails.logger.warn("[RouteWizard] Failed to save preferences: #{e.message}")
  end

  def map_level_for_profile(wizard_level)
    case wizard_level
    when "beginner", "basic" then "beginner"
    when "intermediate" then "intermediate"
    when "advanced" then "advanced"
    else "beginner"
    end
  end
end
