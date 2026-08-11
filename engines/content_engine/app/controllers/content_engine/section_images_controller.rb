# frozen_string_literal: true

module ContentEngine
  class SectionImagesController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    # Enqueue and answer immediately. Generation takes 30-90s; doing it here meant the
    # proxy timed out at 30s (504) and, once that was raised, Puma killed the worker at
    # 60s (502). See SectionImageJob for the full chain.
    def generate
      section_index = params[:section_index].to_i
      section = load_section(section_index)

      if section.blank? || section["image_description"].blank?
        return render json: {
          error: I18n.t("content_engine.image_generation.no_description"),
          success: false
        }, status: :unprocessable_entity
      end

      if section["image_url"].present?
        return render json: { image_url: section["image_url"], success: true, already_exists: true }
      end

      mark_generating!(section_index)
      SectionImageJob.perform_later(@step.id, section_index, current_user.id)

      render json: { success: true, status: "generating" }, status: :accepted
    end

    # Polled by image_generate_controller.js until the job lands.
    def status
      section_index = params[:section_index].to_i
      section = load_section(section_index)

      return render json: { status: "unknown" }, status: :not_found if section.blank?

      if section["image_url"].present?
        render json: {
          status: "ready",
          image_url: section["image_url"],
          html: render_image_html(section["image_url"], section)
        }
      elsif section["image_status"] == "failed"
        render json: {
          status: "failed",
          error: section["image_error"].presence ||
                 I18n.t("content_engine.image_generation.failed", default: "Image generation failed.")
        }
      else
        render json: { status: "generating" }
      end
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

    def mark_generating!(section_index)
      metadata = @step.metadata || {}
      parsed = metadata["parsed_sections"]
      return unless parsed.is_a?(Array) && parsed[section_index]

      parsed[section_index]["image_status"] = "generating"
      parsed[section_index]["image_error"] = nil
      @step.update!(metadata: metadata.merge("parsed_sections" => parsed))
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
