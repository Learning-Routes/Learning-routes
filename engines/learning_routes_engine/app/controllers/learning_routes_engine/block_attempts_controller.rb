# frozen_string_literal: true

module LearningRoutesEngine
  # Receives an interactive block submission, re-grades it server-side, and persists the
  # result. Mirrors StepQuizzesController#submit, which is the one path in this app that
  # already does grading end to end.
  class BlockAttemptsController < ApplicationController
    before_action :authenticate_user!
    before_action :authorize_module_access!
    before_action :set_route_and_step

    def create
      section = parsed_section
      return head(:not_found) if section.blank?

      result = BlockGrader.new(section: section, payload: block_payload).call
      attempt = BlockAttemptRecorder.call(
        user: current_user, route_step: @step, section_index: section_index,
        block_type: section["type"], payload: block_payload, grading: result,
        complete: complete_submission?
      )
      feed_spaced_repetition!(attempt)

      @attempt = attempt
      @result  = result
      @section = section

      respond_to do |format|
        format.json { render json: attempt_json(attempt, result) }
        format.turbo_stream
        format.html { redirect_to learning_routes_engine.route_step_path(@route, @step) }
      end
    end

    private

    # Objective blocks feed FSRS through the step's own schedule. A released attempt
    # returns nil from #fsrs_rating and is skipped — see BlockAttempt#fsrs_rating.
    def feed_spaced_repetition!(attempt)
      rating = attempt.fsrs_rating
      return if rating.nil?

      RouteProgressTracker.new(@route).record_review!(@step, rating)
    rescue => e
      # Never fail a submission because scheduling hiccuped.
      Rails.logger.error("[BlockAttempt] FSRS update failed: #{e.class}: #{e.message}")
    end

    def attempt_json(attempt, result)
      {
        correct: attempt.correct,
        score: attempt.score&.to_f,
        attempts: attempt.attempts,
        released: attempt.released?,
        satisfied: attempt.satisfied?,
        gradable: result.gradable?,
        # Only meaningful for a correctness-gated block that is still gating. An
        # engagement-only block has nothing to run out of, so it reports nil rather
        # than an invented countdown.
        attempts_remaining: attempts_remaining_for(attempt, result)
      }
    end

    def attempts_remaining_for(attempt, result)
      return nil unless result.gradable?
      return 0 if attempt.correct || attempt.released?

      [BlockAttempt::RELEASE_AFTER - attempt.attempts.to_i, 0].max
    end

    def section_index = params[:section_index].to_i

    def parsed_section
      sections = @step.metadata&.dig("parsed_sections")
      return nil unless sections.is_a?(Array)

      sections[section_index]
    end

    def block_payload
      params.fetch(:block, {}).permit!.to_h
    end

    def complete_submission?
      params.dig(:block, :submission_complete) == true
    end

    def set_route_and_step
      # Eager-load the chain: strict_loading_by_default is on, and a lazy traversal here
      # logs a violation on every submission in production.
      @step = RouteStep.includes(learning_route: { learning_profile: :user })
                       .find(params[:step_id])
      @route = @step.learning_route
    end

    def authorize_module_access!
      return if ModuleAccessPolicy.allowed?(user: current_user, route_id: params[:route_id], step_id: params[:step_id])

      head :forbidden
    end
  end
end
