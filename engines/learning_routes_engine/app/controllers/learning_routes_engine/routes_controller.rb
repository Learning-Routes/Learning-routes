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
      @modules = @route.route_modules.includes(:route_steps).order(:position, :id)
      @steps = @modules.select(&:access_preview?).flat_map(&:route_steps)
      @progress = RouteProgressTracker.new(@route).progress_summary
      @due_reviews = SpacedRepetition.new.due_reviews(@route)
    end

    def journey
      # Stages are MODULES, not levels (WP-35 §4). A module is the product's real
      # structure — the thing the student buys and the thing the list view already
      # groups by — while `level` is nv1/nv2/nv3 and a route whose modules all sit
      # at nv1 collapsed into a single ring holding every step it had.
      # ALL modules, not just the preview one. A generated route has exactly one
      # preview module (RouteModule validates uniqueness on it) and the rest are
      # `locked`, so filtering to preview would make "stages are modules" mean
      # "one stage" — fewer than grouping by level, which is not the point of the
      # change. A locked module is precisely the thing the student has not bought
      # yet, and the view already had a locked-stage branch that nothing could
      # reach.
      #
      # Locked stages show their SHAPE, never their content: `journey_topic`
      # masks the title and drops the link for a module the student has no
      # access to, so the paywall holds.
      @journey_modules = @route.route_modules
        .includes(:route_steps)
        .order(:position, :id)
      @steps = @journey_modules.select(&:access_preview?).flat_map { |m| m.route_steps.sort_by(&:position) }
      @progress = RouteProgressTracker.new(@route).progress_summary
      @due_reviews = SpacedRepetition.new.due_reviews(@route)
      @stages = build_journey_stages(@journey_modules)
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
      @route = LearningRoute.includes(:learning_profile).find(params[:id])
    end

    def authorize_route_owner!
      unless @route.learning_profile&.user_id == current_user.id
        redirect_to main_app.dashboard_path, alert: t("flash.not_authorized")
        nil
      end
    end

    LEVEL_COLORS = { "nv1" => "#5BA880", "nv2" => "#6E9BC8", "nv3" => "#8B80C4" }.freeze

    # One stage per MODULE. `level` survives as a tag on the stage rather than as
    # the grouping.
    #
    # Steps keep their route order inside a stage, which is what makes
    # reinforcement cluster: `AdaptiveDifficulty#insert_reinforcement!` shifts the
    # positions of everything after the triggering step and inserts its
    # reinforcement immediately behind it, in the SAME module
    # (`triggering_module_id`). Ordering by position is therefore already
    # clustering; the flag below lets the view say so.
    def build_journey_stages(modules)
      modules.filter_map do |route_module|
        steps = route_module.route_steps.sort_by(&:position)
        next if steps.empty?

        # The stage's level is whatever its steps are; mixed modules take the
        # lowest, which is what a student is being asked to start at.
        level = steps.map(&:level).compact.min || "nv1"

        readable = route_module.access_preview?

        {
          module_id: route_module.id,
          access_state: route_module.access_state,
          level: level,
          label: route_module.localized_title.presence || t("learning_engine.journey.#{level}_label"),
          tag: level.upcase,
          color: LEVEL_COLORS[level] || LEVEL_COLORS["nv1"],
          status: readable ? stage_status_for(steps) : "locked",
          topics: steps.map { |step| journey_topic(step, readable: readable) }
        }
      end
    end

    def stage_status_for(steps)
      statuses = steps.map(&:status)
      return "completed" if statuses.all? { |s| s == "completed" }
      return "current" if statuses.any? { |s| %w[in_progress available].include?(s) }

      "locked"
    end

    def journey_topic(step, readable: true)
      # A locked module contributes its shape and nothing else: the student can
      # see how much is behind the paywall without reading what they have not
      # bought.
      unless readable
        return {
          id: step.id, name: t("learning_engine.journey.locked_topic"),
          content_type: nil, progress: 0, status: "locked",
          reinforcement: false, path: nil
        }
      end

      progress = case step.status
      when "completed" then 100
      when "in_progress" then 50
      else 0
      end

      {
        id: step.id,
        name: step.localized_title,
        content_type: step.content_type,
        progress: progress,
        status: step.status,
        # Rendered as a class on the satellite so a reinforcement step reads as
        # belonging to the step above it rather than as an independent topic.
        reinforcement: step.metadata&.dig("reinforcement").present? ||
                       step.metadata&.dig("triggering_module_id").present?,
        path: route_step_path(@route, step)
      }
    end
  end
end
