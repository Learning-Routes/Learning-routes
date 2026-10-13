module LearningRoutesEngine
  class RouteGenerationJob < ApplicationJob
    queue_as :default
    retry_on StandardError, wait: :polynomially_longer, attempts: 3

    def perform(learning_profile_id)
      # PRELOADED, not lazily traversed. `RouteGenerator#initialize` reads
      # `learning_profile.user` (route_generator.rb:16), and with
      # `strict_loading_by_default` on for every environment (application.rb:48) that
      # is a strict-loading violation. `action_on_strict_loading_violation` is NOT
      # unset — each environment sets it, and none of the three outcomes is an outage:
      #
      #   production  :log, default :all mode (production.rb:102). The violation is
      #               instrumented, strict_loading_notification.rb re-emits it at WARN
      #               (the built-in subscriber logs at DEBUG and production runs at
      #               INFO), and the job carries on. Routes ARE generated; the cost is
      #               a WARN line and the extra query.
      #   development :raise, but :n_plus_one_only (development.rb:122-124). A
      #               belongs_to on a single record is not an N+1, so no violation
      #               fires at all. Measured, by running this job unfixed under that
      #               mode.
      #   test        :raise, :all (test.rb:83-85). This one raises, and the
      #               `retry_on StandardError` above turned it into three retries and
      #               a job that generated nothing — which is why
      #               route_generation_job_test.rb has been red for as long as CI has
      #               not been running it.
      #
      # One record, one association — this is a preload, not an N+1 fix.
      profile = LearningProfile.includes(:user).find(learning_profile_id)

      route = RouteGenerator.new(profile).generate!

      preview = RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
      RouteStep.where(route_module_id: preview.id).order(:position).each do |step|
        next if step.content_type_assessment?

        ContentGenerationJob.perform_later(step.id)
      end

      # Pre-generate assessments
      RouteStep.where(route_module_id: preview.id, content_type: :assessment).find_each do |step|
        AssessmentGenerationJob.perform_later(step.id)
      end

      Rails.logger.info("[RouteGenerationJob] Route generated for profile #{learning_profile_id}: #{route.route_steps.count} steps")
    rescue RouteGenerator::GenerationError => e
      Rails.logger.error("[RouteGenerationJob] Generation failed for profile #{learning_profile_id}: #{e.message}")
      raise # Re-raise for Solid Queue retry
    end
  end
end
