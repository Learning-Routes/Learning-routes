# frozen_string_literal: true

module ContentEngine
  # Generate one visual section's illustration, off the request.
  #
  # This used to run inline in SectionImagesController#generate, and gpt-image-1 takes
  # 30-90s. Every layer in front of it gave up in turn: kamal-proxy at 30s (504), then
  # at 180s Puma's 60s worker_timeout killed the worker mid-response (502). Raising
  # each limit only moved the failure to the next component — with two Puma workers, a
  # 90-second request also means two students illustrating at once take the site down.
  #
  # State lives on the section itself so the controller can answer "is it ready yet?"
  # without a second source of truth. MediaPrefetchJob does the same for prefetch.
  class SectionImageJob < ApplicationJob
    queue_as :default

    # No retry_on: a failed illustration must not re-bill a paid image API on a loop.
    # The failure is recorded on the section and the student can press the button again.

    def perform(route_step_id, section_index, user_id)
      step = LearningRoutesEngine::RouteStep
               .includes(learning_route: { learning_profile: :user })
               .find(route_step_id)
      user = Core::User.find(user_id)

      section = SectionResolver.call(step)[section_index]
      return if section.blank? || section["image_description"].blank?
      return if section["image_url"].present?

      route = step.learning_route
      locale = route.locale || user.locale || I18n.default_locale.to_s

      service = ImageGenerationService.new(user: user, step: step, locale: locale)
      if service.images_remaining_for_step <= 0
        return write_state!(step, section_index, status: "failed",
                            error: I18n.t("content_engine.image_generation.max_reached", locale: locale))
      end

      result = service.generate(
        image_description: section["image_description"],
        metadata: { topic: route.localized_topic(locale), importance: :low }
      )

      write_state!(step, section_index, status: "ready", image_url: result[:image_url])
      Rails.logger.info("[SectionImageJob] step=#{route_step_id} idx=#{section_index} ready")
    rescue => e
      Rails.logger.error("[SectionImageJob] step=#{route_step_id} idx=#{section_index} #{e.class}: #{e.message}")
      write_state!(step, section_index, status: "failed", error: e.message.to_s.truncate(200)) if defined?(step) && step
    end

    private

    # Write straight onto the section in parsed_sections. Re-read first: the job runs
    # minutes after the request, and MediaPrefetchJob may have touched the same array.
    def write_state!(step, section_index, status:, image_url: nil, error: nil)
      step.reload
      metadata = step.metadata || {}
      parsed = metadata["parsed_sections"]
      return unless parsed.is_a?(Array) && parsed[section_index]

      parsed[section_index]["image_status"] = status
      parsed[section_index]["image_url"] = image_url if image_url.present?
      parsed[section_index]["image_error"] = error
      step.update!(metadata: metadata.merge("parsed_sections" => parsed))
    end
  end
end
