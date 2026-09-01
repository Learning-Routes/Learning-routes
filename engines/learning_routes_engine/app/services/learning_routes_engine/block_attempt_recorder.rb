# frozen_string_literal: true

module LearningRoutesEngine
  # Persists one block submission while serializing updates to the student's single
  # authoritative attempt row for this step section.
  class BlockAttemptRecorder
    def self.call(**attributes) = new(**attributes).call

    def initialize(user:, route_step:, section_index:, block_type:, payload:, grading:, complete:)
      @user = user
      @route_step = route_step
      @section_index = section_index
      @block_type = block_type
      @payload = payload
      @grading = grading
      @complete = complete
    end

    def call
      BlockAttempt.transaction do
        attempt = BlockAttempt.find_or_create_by!(identity) do |record|
          record.block_type = @block_type
        end
        attempt.lock!

        reset_stale_attempt!(attempt)
        record_submission!(attempt)
        attempt.save!
        attempt
      end
    end

    private

    def identity
      { user: @user, route_step: @route_step, section_index: @section_index }
    end

    def reset_stale_attempt!(attempt)
      return unless attempt.block_type != @block_type

      Rails.logger.info(
        "[BlockAttempt] section #{@section_index} of step #{@route_step.id} changed type " \
        "#{attempt.block_type} -> #{@block_type}; resetting the stale attempt"
      )
      attempt.assign_attributes(attempts: 0, correct: nil, score: nil,
                                completed_at: nil, released_at: nil)
    end

    def record_submission!(attempt)
      attempt.block_type = @block_type
      attempt.payload = @payload
      attempt.attempts = attempt.attempts.to_i + 1 if @complete

      if @grading.gradable?
        attempt.correct = @grading.correct
        attempt.score = @grading.score
        attempt.completed_at = Time.current if @grading.correct
        maybe_release!(attempt) if @complete
      else
        attempt.correct = nil
        attempt.score = nil
        attempt.completed_at = Time.current
        Rails.logger.debug { "[BlockAttempt] #{@grading.reason}" } if @grading.reason
      end
    end

    def maybe_release!(attempt)
      return if attempt.correct
      return if attempt.released?
      return if attempt.attempts.to_i < BlockAttempt::RELEASE_AFTER

      attempt.released_at = Time.current
      attempt.completed_at = Time.current

      Rails.logger.warn(
        "[BlockAttempt] RELEASED after #{attempt.attempts} failures — the answer key is " \
        "probably wrong. route=#{@route_step.learning_route_id} step=#{@route_step.id} " \
        "section_index=#{attempt.section_index} block_type=#{attempt.block_type}"
      )
    end
  end
end
