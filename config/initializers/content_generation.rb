# frozen_string_literal: true

# Retry policy for the lesson content pipeline.
#
# ContentPipelineJob clears `content_generating` when it fails, which used to make a
# permanently-failing step indistinguishable from a step that had never started: the
# controller re-enqueued the pipeline on every page view and re-paid for the same
# failing AI calls, indefinitely, while the student saw a skeleton and then a timeout.
#
# StepsController#content_retry_due? applies these: give up after
# content_generation_max_attempts, and wait content_generation_retry_backoff after the
# first failure, doubling each time (5min, 10min, 20min).
Rails.application.config.content_generation_max_attempts =
  ENV.fetch("CONTENT_GENERATION_MAX_ATTEMPTS", 3).to_i

Rails.application.config.content_generation_retry_backoff =
  ENV.fetch("CONTENT_GENERATION_RETRY_BACKOFF_SECONDS", 300).to_i.seconds
