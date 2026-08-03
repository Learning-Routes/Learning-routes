# frozen_string_literal: true

# Fails out RouteRequests that have been sitting in a non-terminal status longer
# than RouteRequest::STALE_AFTER.
#
# A request is left `pending`/`generating` forever whenever the worker holding it
# dies mid-generation, or the job is never picked up at all. Because #new and
# #create both refuse to start a new request while one is in flight, a single
# abandoned row locked that user out of the wizard permanently.
#
# The rows are marked `failed`, not deleted:
#   * RouteWizardController#status already has a `failed` branch that returns a
#     localized message, so a browser still polling gets a coherent answer instead
#     of a request that never resolves.
#   * The user's wizard answers and the failure reason are preserved for support
#     and for diagnosing why generation stalled. Deleting destroys both.
class ReapStaleRouteRequestsJob < ApplicationJob
  queue_as :low

  REASON = "Generation did not complete — the request was abandoned and has been " \
           "timed out automatically. Please try again."

  def perform
    reaped = RouteRequest.stale.update_all(
      status: "failed",
      error_message: REASON,
      updated_at: Time.current
    )

    Rails.logger.info("[ReapStaleRouteRequests] failed out #{reaped} stale request(s)") if reaped.positive?
    reaped
  end
end
