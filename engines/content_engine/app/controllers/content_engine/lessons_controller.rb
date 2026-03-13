module ContentEngine
  class LessonsController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    # Legacy endpoints — route through the agent
    def explain_differently
      agent_interact("explain_differently")
    end

    def give_example
      agent_interact("give_example")
    end

    def simplify
      agent_interact("simplify")
    end

    def deepen
      agent_interact("deepen")
    end

    # New unified endpoint: POST /lessons/:id/interact
    def interact
      action = params[:action_type] || "explain_differently"
      message = params[:message]
      section_index = params[:section_index].to_i

      agent_interact(action, message: message, section_index: section_index)
    end

    private

    def set_step_and_authorize!
      @step = LearningRoutesEngine::RouteStep.find(params[:id])
      route = @step.learning_route
      unless route.learning_profile&.user_id == current_user.id
        head :forbidden
        return
      end
    end

    def agent_interact(action, message: nil, section_index: nil)
      section = load_section(section_index)

      agent = LessonAssistantAgent.new(
        step: @step,
        user: current_user,
        section: section
      )

      result = agent.interact(action: action, message: message)

      # Render the response content through MarkdownRenderer
      @rendered_html = MarkdownRenderer.render(result[:content].to_s)
      @response_type = result[:type]

      respond_to do |format|
        format.turbo_stream
        format.json do
          render json: {
            html: @rendered_html,
            type: @response_type,
            success: true
          }
        end
        format.html { redirect_to learning_routes_engine.route_step_path(@step.learning_route, @step) }
      end
    rescue LessonAssistantAgent::RateLimitExceeded => e
      respond_to do |format|
        format.json { render json: { error: e.message, success: false }, status: :too_many_requests }
        format.turbo_stream do
          @error = e.message
          render turbo_stream: turbo_stream.update(
            "ai_supplementary_#{@step.id}",
            html: "<p style='color:var(--color-error); padding:0.75rem;'>#{ERB::Util.html_escape(e.message)}</p>"
          )
        end
        format.html { redirect_to learning_routes_engine.route_step_path(@step.learning_route, @step), alert: e.message }
      end
    rescue => e
      Rails.logger.error("[LessonsController] Agent interaction failed: #{e.message}")
      error_msg = I18n.t("flash.ai_generation_failed", default: "AI generation failed. Please try again.")

      respond_to do |format|
        format.json { render json: { error: error_msg, success: false }, status: :internal_server_error }
        format.turbo_stream do
          render turbo_stream: turbo_stream.update(
            "ai_supplementary_#{@step.id}",
            html: "<p style='color:var(--color-error); padding:0.75rem;'>#{ERB::Util.html_escape(error_msg)}</p>"
          )
        end
        format.html { redirect_to learning_routes_engine.route_step_path(@step.learning_route, @step), alert: error_msg }
      end
    end

    def load_section(section_index)
      return {} unless section_index

      parsed = @step.metadata&.dig("parsed_sections")
      return {} unless parsed.is_a?(Array) && parsed[section_index]

      section = parsed[section_index]
      section.symbolize_keys
    rescue
      {}
    end
  end
end
