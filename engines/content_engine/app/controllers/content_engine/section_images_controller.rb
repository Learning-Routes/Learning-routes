# frozen_string_literal: true

module ContentEngine
  class SectionImagesController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    def generate
      section_index = params[:section_index].to_i
      section = load_section(section_index)

      if section.blank? || section["image_description"].blank?
        return render json: {
          error: I18n.t("content_engine.image_generation.no_description"),
          success: false
        }, status: :unprocessable_entity
      end

      # Check if already has image
      if section["image_url"].present?
        return render json: { image_url: section["image_url"], success: true, already_exists: true }
      end

      locale = @step.learning_route.locale || current_user.locale || "en"
      service = ImageGenerationService.new(user: current_user, step: @step, locale: locale)

      # Check remaining budget
      if service.images_remaining_for_step <= 0
        return render json: {
          error: I18n.t("content_engine.image_generation.max_reached", default: "Maximum images for this lesson reached."),
          success: false
        }, status: :unprocessable_entity
      end

      result = service.generate(
        image_description: section["image_description"],
        metadata: {
          topic: @step.learning_route.localized_topic,
          importance: :low # On-demand = low quality to save cost
        }
      )

      # Update section metadata with new image URL
      update_section_image!(section_index, result[:image_url])

      # Track as user-initiated interaction
      AiOrchestrator::AiInteraction.where(
        user: current_user,
        model: "gpt-image-1"
      ).order(created_at: :desc).first&.update(
        metadata: { "user_initiated" => true, "step_id" => @step.id, "section_index" => section_index }
      )

      render json: {
        success: true,
        image_url: result[:image_url],
        cost_cents: result[:cost_cents],
        generation_time_ms: result[:generation_time_ms],
        html: render_image_html(result[:image_url], section)
      }
    rescue ImageGenerationService::GenerationError => e
      render json: { error: e.message, success: false }, status: :unprocessable_entity
    rescue => e
      Rails.logger.error("[SectionImagesController] Image generation failed: #{e.message}")
      render json: {
        error: I18n.t("content_engine.image_generation.failed", default: "Image generation failed. Please try again."),
        success: false
      }, status: :internal_server_error
    end

    private

    # Eager-load the route/profile/user chain. strict_loading_by_default is on, so
    # the lazy traversal below raised in dev/test and logged a violation on every
    # click of the generate button in production. The action then reads
    # route.locale and route.localized_topic off the same chain.
    def set_step_and_authorize!
      @step = LearningRoutesEngine::RouteStep
                .includes(learning_route: { learning_profile: :user })
                .find(params[:step_id])
      route = @step.learning_route
      unless route.learning_profile&.user_id == current_user.id
        head :forbidden
      end
    end

    # Resolve through SectionResolver so the index we look up is the index the page was
    # rendered from. This was patched locally here first; the same defect then turned up
    # in the AI tools and in the block gate, so it moved to one place.
    def load_section(section_index)
      sections = ContentEngine::SectionResolver.call(@step)
      return nil unless sections.is_a?(Array) && sections[section_index]

      sections[section_index]
    end

    def update_section_image!(section_index, image_url)
      metadata = @step.metadata || {}
      parsed = metadata["parsed_sections"]
      return unless parsed.is_a?(Array) && parsed[section_index]

      parsed[section_index]["image_url"] = image_url
      @step.update!(metadata: metadata.merge("parsed_sections" => parsed))
    end

    def render_image_html(image_url, section)
      alt_text = section["alt_text"].presence || section["title"]
      caption = section["title"]

      <<~HTML
        <div style="border-radius:14px; overflow:hidden; border:1px solid var(--color-border-subtle); box-shadow:0 2px 8px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.02);">
          <img src="#{ERB::Util.html_escape(image_url)}" alt="#{ERB::Util.html_escape(alt_text)}"
               style="width:100%; max-width:100%; height:auto; display:block;"
               loading="lazy">
          <p style="text-align:center; font-size:0.8125rem; color:var(--color-muted); padding:0.625rem 1rem; margin:0; font-style:italic;">#{ERB::Util.html_escape(caption)}</p>
        </div>
      HTML
    end
  end
end
