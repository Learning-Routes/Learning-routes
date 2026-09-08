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
      section_index = params[:section_index].present? ? params[:section_index].to_i : nil

      agent_interact(action, message: message, section_index: section_index)
    end

    private

    # Eager-loads the route every path here walks: the success redirect, both
    # refusal redirects, and `LessonAssistantAgent` itself. This was a bare
    # `find`, so `@step.learning_route` (and the profile behind it) was a lazy
    # load on a strict_loading
    # record — the third instance of that family found in this branch, after the
    # step quiz in WP-32 and the tutor message in §1.
    #
    # The step is loaded DIRECTLY here, which `:all` does mark — so production
    # (which runs `:all` and logs) did record this one, and the suite (`:all` and
    # raises) caught it: it was swallowed by the same `rescue` that mislabelled
    # the UnknownFormat and turned every one of these tests into a 502.
    def set_step_and_authorize!
      return unless authorize_route_step_access!(params[:id])

      @step = LearningRoutesEngine::RouteStep.includes(learning_route: :learning_profile).find(params[:id])
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
        # `format.turbo_stream` is back for the four legacy actions, and this is
        # the line a115721 (WP-25) removed. Its reasoning — that
        # `agent_interact.turbo_stream.erb` does not exist — was true of the
        # method's own name and false of the request: Rails renders the template
        # named after the calling ACTION, and explain_differently, give_example,
        # simplify and deepen all have one. The four buttons send
        # `Accept: text/vnd.turbo-stream.html`, so without this the PAID CALL RAN,
        # SUCCEEDED, and then `respond_to` raised UnknownFormat — which the
        # `rescue` below caught as a model failure and answered with escaped
        # markup at HTTP 200.
        #
        # `interact` genuinely has no template, so it is asked rather than
        # assumed: declare the format exactly when it can be rendered, which is
        # the invariant `RespondToFormatsHaveTemplatesTest` enforces from the
        # other side.
        format.turbo_stream if turbo_stream_template?
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
      Rails.logger.warn("[LessonsController] Agent rate limited: #{e.class}: #{e.message}")
      refuse_agent(t("content_actions.agent_rate_limited"), status: :too_many_requests)
    rescue => e
      # `e.class` as well as the message. Without it the production log said
      # "Agent interaction failed: ..." for an ActionController::UnknownFormat
      # raised after a successful call, and the diagnosis took a log line that
      # did not exist.
      Rails.logger.error("[LessonsController] Agent interaction failed: #{e.class}: #{e.message}")
      refuse_agent(t("content_actions.agent_failed"), status: :bad_gateway)
    end

    # One refusal, one partial, the right status in EVERY format.
    #
    # The turbo_stream branch used to build its markup in a String and pass it as
    # `html:`, which `turbo_stream.update` renders through
    # ActionView::Template::HTML — and that escapes a plain String, so the
    # student read the tag source. It also carried no `status:`, so a failure was
    # served as 200 while the JSON branch beside it said 500.
    def refuse_agent(message, status:)
      @error = message

      respond_to do |format|
        format.turbo_stream do
          render turbo_stream: turbo_stream.append(
            "ai_supplementary_#{@step.id}",
            partial: "content_engine/lessons/agent_error",
            locals: { message: message }
          ), status: status
        end
        format.json { render json: { error: message, success: false }, status: status }
        format.html do
          redirect_to learning_routes_engine.route_step_path(@step.learning_route, @step), alert: message
        end
      end
    end

    # Can the CALLING action render a turbo stream? The four legacy actions have
    # a template each; `interact` does not and stays JSON-only.
    def turbo_stream_template?
      template_exists?(action_name, lookup_context.prefixes, false, formats: [:turbo_stream])
    end

    def load_section(section_index)
      return {} unless section_index

      parsed = SectionResolver.call(@step)
      return {} unless parsed.is_a?(Array) && parsed[section_index]

      parsed[section_index].symbolize_keys
    rescue
      {}
    end
  end
end
