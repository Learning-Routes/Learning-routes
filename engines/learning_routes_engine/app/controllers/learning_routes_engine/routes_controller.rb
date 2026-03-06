module LearningRoutesEngine
  class RoutesController < ApplicationController
    before_action :authenticate_user!
    before_action :set_route
    before_action :authorize_route_owner!

    rate_limit to: 3, within: 5.minutes, only: :request_deletion, with: -> {
      head :too_many_requests
    }

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

    def request_deletion
      code = SecureRandom.random_number(10**6).to_s.rjust(6, "0")
      Rails.cache.write(deletion_cache_key, code, expires_in: 10.minutes)
      Core::DeletionMailer.route_deletion_code(current_user, @route, code).deliver_later
      head :ok
    end

    def confirm_deletion
      stored_code = Rails.cache.read(deletion_cache_key)
      submitted_code = params[:code].to_s.strip

      if stored_code.present? && ActiveSupport::SecurityUtils.secure_compare(stored_code, submitted_code)
        Rails.cache.delete(deletion_cache_key)
        topic = @route.localized_topic
        @route.destroy!
        flash[:notice] = t("delete_route.success", route: topic)
        render json: { redirect: main_app.profile_path }, status: :ok
      else
        render turbo_stream: turbo_stream.update("delete-route-error",
          html: content_tag(:p, t("delete_route.wrong_code"), style: "color:#B06050; font-size:0.8125rem; margin:0;")
        ), status: :unprocessable_entity
      end
    end

    private

    def deletion_cache_key
      "route_deletion_code:#{current_user.id}:#{@route.id}"
    end

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
