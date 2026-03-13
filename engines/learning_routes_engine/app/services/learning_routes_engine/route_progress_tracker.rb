module LearningRoutesEngine
  class RouteProgressTracker
    def initialize(route)
      @route = route
      @spaced_repetition = SpacedRepetition.new
    end

    attr_reader :xp_result

    # Mark a step as complete, initialize FSRS, advance route, unlock next
    def complete_step!(step)
      return step if step.completed?

      route_just_completed = false
      changed_step_ids = []

      ActiveRecord::Base.transaction do
        step.reload
        return step if step.completed?

        step.complete!
        changed_step_ids << step.id

        # Initialize FSRS with a Good rating for first completion
        fsrs_params = @spaced_repetition.review(step, SpacedRepetition::GOOD)
        step.update!(fsrs_params)

        # Advance current_step pointer
        advance_current_step!
        route_just_completed = @route.completed?

        # Unlock next available steps — track which ones changed
        @route.route_steps.locked.find_each do |locked_step|
          old_status = locked_step.status
          locked_step.unlock_if_ready!
          if locked_step.status != old_status
            changed_step_ids << locked_step.id
          end
        end
      end

      # Award XP and record streak (outside transaction — non-critical)
      @xp_result = award_engagement!(step, route_just_completed)

      broadcast_progress!(changed_step_ids)
      step
    end

    # Record a spaced repetition review
    def record_review!(step, rating)
      fsrs_params = @spaced_repetition.review(step, rating)
      step.update!(fsrs_params)
      broadcast_progress!
      step
    end

    # Summary of route progress
    def progress_summary
      steps = @route.route_steps
      completed = steps.completed_steps.count
      total = steps.count
      due = steps.due_for_review.count

      {
        total_steps: total,
        completed_steps: completed,
        percentage: total > 0 ? ((completed.to_f / total) * 100).round(1) : 0,
        remaining_minutes: @route.estimated_remaining_minutes,
        due_reviews: due,
        current_step: @route.current_step,
        status: @route.status
      }
    end

    # Steps currently available to work on
    def available_steps
      @route.route_steps.available_steps
    end

    # Steps due for spaced repetition review
    def due_reviews
      @spaced_repetition.due_reviews(@route)
    end

    private

    def advance_current_step!
      next_position = @route.route_steps.where.not(status: :completed).minimum(:position)
      @route.update!(current_step: next_position || @route.total_steps)

      if @route.route_steps.where.not(status: :completed).none?
        @route.completed!
      end
    end

    def unlock_next_steps!(completed_step)
      # Note: This method is kept for backward compatibility (e.g. called from other paths).
      # The complete_step! method now inlines this logic to track changed steps.
      @route.route_steps.locked.find_each do |step|
        step.unlock_if_ready!
      end
    end

    def award_engagement!(step, route_completed)
      user = @route.learning_profile&.user
      return unless user

      # Record daily streak activity
      StreakService.new(user).record_activity!

      # Award step completion XP
      result = XpService.award(user, XpService::XP_VALUES[:step_complete], "step_complete", source_id: step.id.to_s)

      # Award route completion bonus
      if route_completed
        result = XpService.award(user, XpService::XP_VALUES[:route_complete], "route_complete", source_id: @route.id.to_s)
      end

      result
    rescue => e
      Rails.logger.warn("[RouteProgressTracker] Engagement award failed: #{e.message}")
      nil
    end

    def broadcast_progress!(changed_step_ids = [])
      return unless defined?(Turbo::StreamsChannel)

      channel = "learning_route_#{@route.id}"

      # Broadcast updated progress bar
      Turbo::StreamsChannel.broadcast_replace_to(
        channel,
        target: "route_progress_#{@route.id}",
        partial: "learning_routes_engine/routes/progress",
        locals: { route: @route, summary: progress_summary }
      )

      # Broadcast each changed step item (completed step + newly unlocked steps)
      if changed_step_ids.any?
        steps_by_id = @route.route_steps.where(id: changed_step_ids).index_by(&:id)
        ordered_positions = @route.route_steps.order(:position).pluck(:id, :position).to_h

        changed_step_ids.each do |step_id|
          step = steps_by_id[step_id]
          next unless step

          # Determine the 0-based index from position ordering
          index = ordered_positions.keys.index(step_id) || 0

          Turbo::StreamsChannel.broadcast_replace_to(
            channel,
            target: "route_step_#{step_id}",
            partial: "learning_routes_engine/routes/step_item",
            locals: { step: step, index: index, route: @route }
          )
        end
      end
    rescue => e
      Rails.logger.warn("[RouteProgressTracker] Broadcast failed: #{e.message}")
    end
  end
end
