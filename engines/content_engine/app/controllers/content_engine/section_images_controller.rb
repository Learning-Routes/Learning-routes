# frozen_string_literal: true

module ContentEngine
  class SectionImagesController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!
    # `generate` spends money, so it needs the narrower gate: a refunded
    # purchase keeps reading what exists but must not commission more.
    before_action -> { authorize_route_step_generation!(params[:step_id]) }, only: :generate

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

      # The claim, not the read at the top of this action, is what decides whether
      # we spend. `section["image_url"].present?` above was read through
      # SectionResolver before any lock was taken, so two clicks arriving while
      # the first job is still running both see it blank and both get here.
      if mark_generating!(section_index) == :already_generating
        return render json: { success: true, status: "generating" }, status: :accepted
      end

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
      return unless authorize_route_step_access!(params[:step_id])

      @step = LearningRoutesEngine::RouteStep
                .includes(learning_route: { learning_profile: :user })
                .find(params[:step_id])
    end

    # Resolve through SectionResolver so the index we look up is the index the page was
    # rendered from. This was patched locally here first; the same defect then turned up
    # in the AI tools and in the block gate, so it moved to one place.
    def load_section(section_index)
      sections = ContentEngine::SectionResolver.call(@step)
      return nil unless sections.is_a?(Array) && sections[section_index]

      sections[section_index]
    end

    # UNDER THE LOCK, AND RE-READ. `merge_metadata!` alone is not enough here:
    # it keeps the top-level keys this caller does not name, but this caller
    # rebuilds the WHOLE `parsed_sections` array and names it. `RouteStep`
    # says so itself — "`||` is shallow, exactly like Hash#merge. A caller
    # mutating a NESTED structure must still re-read that structure immediately
    # before writing."
    #
    # The array read at the top of the request is minutes old by web standards:
    # a `SectionImageJob` committing another section's `image_url` in between
    # was written straight back out as nil, and `MediaPrefetchJob` then bought
    # that image again. Both jobs already re-read (`SectionImageJob#write_state!`
    # reloads, `MediaPrefetchJob#apply_results!` uses `fresh_metadata`); this
    # was the writer still holding a stale copy. Same three lines as
    # `SectionAudioController#update_audio_section_status!`.
    # Returns :claimed, :already_generating, or :no_metadata.
    #
    # AND IT IS A CLAIM, not just a status write. WP-33 §1 put this under the
    # lock, which closed the write race; the decision race stayed open, and the
    # decision is the one that costs money. `generate` resolved the section and
    # checked `image_url` OUTSIDE this lock, so two clicks before either job
    # lands both pass that check and both enqueue a paid job.
    # `SectionImageJob:28` only rejects a job enqueued after the first has
    # committed a URL, which is exactly the case that was never the problem.
    #
    # `image_status == "generating"` was already being written here atomically
    # and read by nobody — the poll endpoint only ever looked for "failed". This
    # is that missing reader.
    #
    # :no_metadata is NOT a refusal. A step whose `parsed_sections` has not been
    # written yet renders from AiContent through SectionResolver
    # (SectionImagesFallbackTest), and there is nowhere to record a claim; the
    # caller enqueues anyway rather than making that student's button dead. Such
    # a step can still be double-clicked into two jobs.
    def mark_generating!(section_index)
      outcome = :no_metadata
      @step.with_lock do
        parsed = @step.fresh_metadata["parsed_sections"]
        next unless parsed.is_a?(Array) && parsed[section_index]

        if parsed[section_index]["image_status"] == "generating"
          outcome = :already_generating
          next
        end

        parsed[section_index]["image_status"] = "generating"
        parsed[section_index]["image_error"] = nil
        @step.merge_metadata!("parsed_sections" => parsed)
        outcome = :claimed
      end
      outcome
    end

    def render_image_html(image_url, section)
      # `section["title"]` is nil for an untitled block now that the parser no
      # longer bakes a translated default into parsed_sections (WP-33 §4), so
      # both of these fall back to the same key the view's `block_title` uses.
      # Without it an untitled visual loses its accessible name.
      default_title = t("learning_engine.blocks.default_title.visual")
      alt_text = section["alt_text"].presence || section["title"].presence || default_title
      caption = section["title"].presence || default_title

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
