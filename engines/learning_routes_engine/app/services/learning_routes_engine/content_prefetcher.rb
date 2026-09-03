# frozen_string_literal: true

module LearningRoutesEngine
  # The single way content generation gets enqueued.
  #
  # THREE call sites used to enqueue ContentPipelineJob, and only one of them was safe:
  #
  #   StepsController#prefetch_upcoming_steps!   atomic claim on BOTH flags   ✅
  #   WizardRouteGenerationJob#pregenerate_content!   plain update!           ❌
  #   BackgroundContentGenerationJob             rejects content_ready only   ❌
  #
  # That matters because ContentPipelineJob's own idempotency guard is
  # `return if content_ready` — it does NOT check content_generating. So enqueuing a
  # step that is still in flight runs a SECOND full pipeline and pays for a second
  # lesson_content call (~3¢ each, measured). BackgroundContentGenerationJob fires 30s
  # after route creation, which is inside the window where the first three steps are
  # often still generating (median pipeline ~20s), so the first three lessons of a route
  # could be billed twice.
  #
  # This class claims steps atomically — one UPDATE with a WHERE that excludes anything
  # already ready or already generating, RETURNING the rows it actually flipped — and
  # enqueues only those. A caller that loses the race enqueues nothing.
  class ContentPrefetcher
    # THE PREVIEW FILTER IN THIS CLASS IS A SPEND BOUNDARY, NOT A DISPLAY RULE.
    #
    # `available_slots` and `pending_step_ids` restrict to `access_state: :preview`.
    # `claim` restricts to the states its caller passes, and the prefetch path passes
    # PREVIEW_ONLY — the parameter exists so the student's current step can reuse the
    # SAME atomic claim without a second copy of the SQL, not to loosen this boundary.
    # Together they are currently the only thing stopping a refunded route from
    # prefetching paid lessons: this class has no user and therefore cannot ask
    # `ModuleAccessPolicy.generation_allowed?`.
    #
    # Task 8 has to widen this to reach `purchased` modules. When it does, the
    # entitlement check has to arrive at the same time — a purchase that has
    # since been refunded leaves its modules in `purchased`, so widening the
    # filter alone re-opens exactly the hole this comment exists to prevent.
    # `test/services/learning_routes_engine/content_prefetcher_scope_test.rb`
    # fails if the filter is widened without one.

    # The module states the free prefetch path is allowed to spend on. Passed
    # explicitly rather than baked into the SQL so that the ONE atomic claim in
    # this codebase can serve both the prefetch path (preview only) and the
    # student's current step (whatever they are authorized to read). Task 8 will
    # widen the prefetch path; a second copy of the SQL would drift from this one.
    PREVIEW_ONLY = %i[preview].freeze

    # Most pipelines this route may have in flight at once.
    #
    # ContentPipelineJob runs on `default`, whose Solid Queue pool is 3 threads SHARED
    # with `low` and `low_priority` — mailers, streaks, reaper. Letting one route claim
    # all three starves everything else on the box, and the job container has 512MB and
    # 2 CPUs. Two leaves a thread for the rest of the system.
    MAX_IN_FLIGHT_PER_ROUTE = 2

    class << self
      # Claim up to `limit` not-yet-generated steps of `route` and enqueue them.
      # Returns the step ids actually enqueued.
      def prefetch(route, step_ids, options: { pregenerate_audio: true }, limit: nil,
                   access_states: PREVIEW_ONLY)
        step_ids = Array(step_ids).compact
        return [] if step_ids.empty?

        budget = available_slots(route)
        return [] if budget.zero?

        budget = [budget, limit].compact.min
        claimed = claim(step_ids.first(budget), access_states: access_states)

        claimed.each { |id| ContentPipelineJob.perform_later(id, options) }
        claimed
      end

      # How many more pipelines this route may start right now.
      def available_slots(route)
        in_flight = RouteStep.where(learning_route_id: route.id)
                             .joins(:route_module)
                             .where(learning_routes_engine_route_modules: { access_state: :preview })
                             .where("learning_routes_engine_route_steps.metadata->>'content_generating' = 'true'")
                             .where("(learning_routes_engine_route_steps.metadata->>'content_ready') IS DISTINCT FROM 'true'")
                             .count

        [MAX_IN_FLIGHT_PER_ROUTE - in_flight, 0].max
      end

      # Flip content_generating on the given steps, but only for rows that are neither
      # ready nor already generating. Returns the ids actually flipped.
      #
      # jsonb_set rather than update!: metadata can hold parsed_sections of 100-300KB and
      # rewriting the whole blob to flip one flag is wasteful. RETURNING makes the claim
      # and the read of who-won a single statement, so two concurrent callers cannot both
      # think they claimed the same step.
      def claim(step_ids, access_states:)
        step_ids = Array(step_ids).compact
        states = Array(access_states).map { |state| RouteModule.access_states.fetch(state.to_s) }
        return [] if step_ids.empty? || states.empty?

        sql = ActiveRecord::Base.send(:sanitize_sql_array, [
          <<~SQL.squish, step_ids, states
            UPDATE learning_routes_engine_route_steps
            SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{content_generating}', 'true'::jsonb),
                updated_at = NOW()
            WHERE id IN (?)
              AND EXISTS (
                SELECT 1 FROM learning_routes_engine_route_modules modules
                WHERE modules.id = learning_routes_engine_route_steps.route_module_id
                  AND modules.learning_route_id = learning_routes_engine_route_steps.learning_route_id
                  AND modules.access_state IN (?)
              )
              AND (metadata->>'content_ready')      IS DISTINCT FROM 'true'
              AND (metadata->>'content_generating') IS DISTINCT FROM 'true'
            RETURNING id
          SQL
        ])

        ActiveRecord::Base.connection.execute(sql).map { |row| row["id"] }
      end

      # Give a claim back, atomically and without touching the rest of the blob.
      #
      # A claim that is never released is worse than no claim at all: the step
      # looks permanently in-flight and nothing will ever generate it. Every
      # caller that claims must release on any path where the pipeline will not
      # actually run.
      def release(step_ids)
        step_ids = Array(step_ids).compact
        return [] if step_ids.empty?

        sql = ActiveRecord::Base.send(:sanitize_sql_array, [
          <<~SQL.squish, step_ids
            UPDATE learning_routes_engine_route_steps
            SET metadata = COALESCE(metadata, '{}'::jsonb) - 'content_generating',
                updated_at = NOW()
            WHERE id IN (?)
              AND (metadata->>'content_generating') IS NOT DISTINCT FROM 'true'
            RETURNING id
          SQL
        ])

        ActiveRecord::Base.connection.execute(sql).map { |row| row["id"] }
      end

      # Steps of this route that still need content, nearest-first.
      # Assessments are excluded — they are generated by AssessmentGenerationJob.
      def pending_step_ids(route, after_position: nil, limit: nil)
        scope = RouteStep.where(learning_route_id: route.id)
                         .joins(:route_module)
                         .where(learning_routes_engine_route_modules: { access_state: :preview })
                         .where.not(content_type: :assessment)
                         .where("(learning_routes_engine_route_steps.metadata->>'content_ready') IS DISTINCT FROM 'true'")
                         .order("learning_routes_engine_route_steps.position")
        scope = scope.where("learning_routes_engine_route_steps.position > ?", after_position) if after_position
        scope = scope.limit(limit) if limit
        scope.pluck(:id)
      end
    end
  end
end
