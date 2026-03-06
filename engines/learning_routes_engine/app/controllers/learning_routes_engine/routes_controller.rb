module LearningRoutesEngine
  class RoutesController < ApplicationController
    before_action :authenticate_user!
    before_action :set_route
    before_action :authorize_route_owner!

    layout "learning"

    def show
      @steps = @route.route_steps.order(:position)
      @progress = RouteProgressTracker.new(@route).progress_summary
      @due_reviews = SpacedRepetition.new.due_reviews(@route)
    end

    def journey
      @steps = @route.route_steps.order(:position)
      @progress = RouteProgressTracker.new(@route).progress_summary
      @due_reviews = SpacedRepetition.new.due_reviews(@route)
      @stages = build_journey_stages(@steps)
      render layout: "journey"
    end

    private

    def set_route
      @route = LearningRoute.find(params[:id])
    end

    def authorize_route_owner!
      unless @route.learning_profile&.user_id == current_user.id
        redirect_to main_app.dashboard_path, alert: t("flash.not_authorized")
        return
      end
    end

    LEVEL_COLORS = { "nv1" => "#5BA880", "nv2" => "#6E9BC8", "nv3" => "#8B80C4" }.freeze

    def build_journey_stages(steps)
      grouped = steps.group_by(&:level)
      %w[nv1 nv2 nv3].filter_map do |level|
        level_steps = grouped[level]
        next unless level_steps&.any?

        statuses = level_steps.map(&:status)
        stage_status = if statuses.all? { |s| s == "completed" }
                         "completed"
                       elsif statuses.any? { |s| %w[in_progress available].include?(s) }
                         "current"
                       else
                         "locked"
                       end

        {
          level: level,
          label: t("learning_engine.journey.#{level}_label"),
          tag: level.upcase,
          color: LEVEL_COLORS[level],
          status: stage_status,
          topics: level_steps.map { |step|
            prog = case step.status
                   when "completed" then 100
                   when "in_progress" then 50
                   else 0
                   end
            {
              id: step.id,
              name: step.localized_title,
              content_type: step.content_type,
              progress: prog,
              status: step.status,
              path: route_step_path(@route, step)
            }
          }
        }
      end
    end
  end
end
