module LearningRoutesEngine
  # Fills in the rest of a route's lessons behind the student.
  #
  # REWRITTEN: the previous version enqueued EVERY remaining step at once on a 5s
  # stagger, skipping only steps already `content_ready`. Two problems:
  #
  #   1. DOUBLE BILLING. It fires 30s after route creation, while the three priority
  #      steps are often still generating (median pipeline ~20s, two at a time). It only
  #      checked content_ready, and ContentPipelineJob only guards on content_ready too,
  #      so an in-flight step got a second full pipeline and a second paid
  #      lesson_content call (~3¢).
  #   2. STAMPEDE. An 18-step route enqueued 15 pipelines onto `low_priority`, whose
  #      Solid Queue pool is 3 threads SHARED with `default` and `low` — mailers,
  #      streaks, the stale-request reaper. A 5s stagger does not bound concurrency, it
  #      only spreads the arrivals; the queue depth is unchanged.
  #
  # Now: claim a bounded batch through ContentPrefetcher, then re-schedule itself until
  # the route is done. Concurrency is capped per route, the claim is atomic so nothing is
  # enqueued twice, and the work still completes — just without a thundering herd.
  class BackgroundContentGenerationJob < ApplicationJob
    queue_as :low_priority

    retry_on StandardError, wait: 30.seconds, attempts: 2

    # How long to wait before looking for more work. Comfortably longer than a pipeline
    # (median ~20s) so a re-run usually finds a free slot rather than spinning.
    RECHECK_AFTER = 45.seconds

    # Stop rescheduling eventually, so a route whose steps permanently fail to reach
    # content_ready cannot reschedule this job forever.
    MAX_PASSES = 40

    def perform(route_id, options = {}, pass = 0)
      route = LearningRoute.find_by(id: route_id)
      return unless route

      pending = ContentPrefetcher.pending_step_ids(route)
      if pending.empty?
        Rails.logger.info("[BackgroundContentGeneration] route #{route_id} fully generated")
        return
      end

      if pass >= MAX_PASSES
        Rails.logger.warn(
          "[BackgroundContentGeneration] giving up on route #{route_id} after #{pass} passes; " \
          "#{pending.size} step(s) never reached content_ready"
        )
        return
      end

      enqueued = ContentPrefetcher.prefetch(route, pending, options: default_options(options))

      Rails.logger.info(
        "[BackgroundContentGeneration] route #{route_id} pass=#{pass}: " \
        "enqueued #{enqueued.size}, #{pending.size - enqueued.size} still pending"
      )

      # More to do — come back when a slot is likely free. This is the throttle: at most
      # MAX_IN_FLIGHT_PER_ROUTE pipelines for this route are ever running at once.
      self.class.set(wait: RECHECK_AFTER).perform_later(route_id, options, pass + 1)
    end

    private

    def default_options(options)
      opts = (options || {}).symbolize_keys
      opts.key?(:pregenerate_audio) ? opts : opts.merge(pregenerate_audio: true)
    end
  end
end
