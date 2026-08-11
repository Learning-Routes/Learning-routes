# frozen_string_literal: true

module LearningRoutesEngine
  # Receives an interactive block submission, re-grades it server-side, and persists the
  # result. Mirrors StepQuizzesController#submit, which is the one path in this app that
  # already does grading end to end.
  class BlockAttemptsController < ApplicationController
    before_action :authenticate_user!
    before_action :set_route_and_step
    before_action :authorize_route_owner!

    def create
      section = parsed_section
      return head(:not_found) if section.blank?

      attempt = BlockAttempt.find_or_initialize_by(
        user: current_user, route_step: @step, section_index: section_index
      )

      # Re-check the type at this index. parsed_sections is stable for the life of the
      # content but not across a regeneration, so an attempt recorded against a section
      # that has since changed type is stale and must not be mis-attributed.
      if attempt.persisted? && attempt.block_type != section["type"]
        Rails.logger.info(
          "[BlockAttempt] section #{section_index} of step #{@step.id} changed type " \
          "#{attempt.block_type} -> #{section['type']}; resetting the stale attempt"
        )
        attempt.assign_attributes(attempts: 0, correct: nil, score: nil,
                                  completed_at: nil, released_at: nil)
      end

      result = BlockGrader.new(section: section, payload: block_payload).call

      attempt.block_type = section["type"]
      attempt.payload    = block_payload
      attempt.attempts   = attempt.attempts.to_i + 1

      if result.gradable?
        attempt.correct = result.correct
        attempt.score   = result.score
        attempt.completed_at = Time.current if result.correct
        maybe_release!(attempt)
      else
        # Engagement-only: interacting IS completing. Correct stays NULL so nothing
        # downstream mistakes it for a right answer.
        attempt.correct = nil
        attempt.score   = nil
        attempt.completed_at = Time.current
        Rails.logger.debug { "[BlockAttempt] #{result.reason}" } if result.reason
      end

      attempt.save!
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

    # The escape valve. A well-formed block with a WRONG answer key is likelier than a
    # malformed one — every block is AI-generated and the prompts were rewritten days ago
    # — and unlimited retry against an unwinnable question is a trap, not generosity.
    #
    # After RELEASE_AFTER failures the block stops gating. It is NOT marked correct:
    # released_at is a separate column precisely so this never reads as a pass.
    def maybe_release!(attempt)
      return if attempt.correct
      return if attempt.released?
      return if attempt.attempts.to_i < BlockAttempt::RELEASE_AFTER

      attempt.released_at  = Time.current
      attempt.completed_at = Time.current

      Rails.logger.warn(
        "[BlockAttempt] RELEASED after #{attempt.attempts} failures — the answer key is " \
        "probably wrong. route=#{@route.id} step=#{@step.id} " \
        "section_index=#{attempt.section_index} block_type=#{attempt.block_type}"
      )
    end

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

    def set_route_and_step
      # Eager-load the chain: strict_loading_by_default is on, and a lazy traversal here
      # logs a violation on every submission in production.
      @step = RouteStep.includes(learning_route: { learning_profile: :user })
                       .find(params[:step_id])
      @route = @step.learning_route
    end

    def authorize_route_owner!
      head(:forbidden) unless @route&.learning_profile&.user_id == current_user.id
    end
  end
end
