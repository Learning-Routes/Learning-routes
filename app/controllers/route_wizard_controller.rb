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
  end

  def create
    @route_request = current_user.route_requests.new(wizard_params)

    if @route_request.save
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
          # Show error banner without replacing the wizard (preserves Stimulus state)
          render turbo_stream: turbo_stream.replace("wizard-error-banner") {
            tag.div(id: "wizard-error-banner", "data-route-wizard-target": "errorBanner",
              style: "max-width:560px; width:100%; margin-bottom:10px; padding:10px 16px; border-radius:10px; background:rgba(176,96,80,0.08); border:1px solid rgba(176,96,80,0.15); font-family:'DM Sans',sans-serif; font-size:0.78rem; color:#B06050;") {
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
      :custom_topic, :level, :pace,
      topics: [], goals: [],
      learning_style_answers: {}
    ).tap do |p|
      p[:topics] = p[:topics]&.reject(&:blank?) || []
      p[:goals] = p[:goals]&.reject(&:blank?) || []
      # Remove empty style answer values (hidden fields start as "")
      if p[:learning_style_answers].present?
        p[:learning_style_answers] = p[:learning_style_answers].reject { |_, v| v.blank? }
      end
    end
  end
end
