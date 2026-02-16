module LearningRoutesEngine
  class RouteProgressTracker
    def initialize(route)
      @route = route
      @spaced_repetition = SpacedRepetition.new
    end

    # Mark a step as complete, initialize FSRS, advance route, unlock next
    def complete_step!(step)
      ActiveRecord::Base.transaction do
        step.complete!

        # Initialize FSRS with a Good rating for first completion
        fsrs_params = @spaced_repetition.review(step, SpacedRepetition::GOOD)
        step.update!(fsrs_params)

        # Advance current_step pointer
        advance_current_step!

        # Unlock next available steps
        unlock_next_steps!(step)
      end

      broadcast_progress!
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
      # Find steps that list the completed step as a prerequisite
      @route.route_steps.locked.find_each do |step|
        step.unlock_if_ready!
      end
    end

    def broadcast_progress!
      return unless defined?(Turbo::StreamsChannel)

      Turbo::StreamsChannel.broadcast_replace_to(
        "learning_route_#{@route.id}",
        target: "route_progress_#{@route.id}",
        partial: "learning_routes_engine/routes/progress",
        locals: { route: @route, summary: progress_summary }
      )
    rescue => e
      Rails.logger.warn("[RouteProgressTracker] Broadcast failed: #{e.message}")
    end
  end
end
