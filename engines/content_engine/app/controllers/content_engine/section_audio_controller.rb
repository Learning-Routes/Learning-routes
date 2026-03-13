# frozen_string_literal: true

module ContentEngine
  class SectionAudioController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    # POST /content/section_audio/:step_id/:section_index/generate
    def generate
      section_index = params[:section_index].to_i
      section_text = params[:section_text].to_s.strip

      if section_text.blank?
        render json: { status: "error", message: "No text provided" }, status: :unprocessable_entity
        return
      end

      # Return cached audio if already generated
      cached = SectionAudioGenerator.cached(@step.id, section_index)
      if cached
        show_url = "/content/section_audio/#{@step.id}/#{section_index}/show"
        update_audio_section_status!(section_index, "ready", show_url, cached[:duration])
        render json: { status: "ready", audio_url: show_url, duration: cached[:duration] }
        return
      end

      # Mark as generating in metadata
      update_audio_section_status!(section_index, "generating")

      locale = @step.learning_route&.locale || "en"
      target_locale = @step.learning_route&.target_locale

      SectionAudioGenerationJob.perform_later(
        @step.id, section_index, section_text, locale, target_locale.to_s
      )

      render json: { status: "generating" }
    end

    # GET /content/section_audio/:step_id/:section_index/status
    def status
      section_index = params[:section_index].to_i

      # Check metadata first for real-time status
      audio_status = @step.metadata&.dig("audio_sections", section_index.to_s)
      if audio_status && audio_status["status"] == "ready" && audio_status["url"]
        show_url = "/content/section_audio/#{@step.id}/#{section_index}/show"
        render json: {
          status: "ready",
          audio_url: show_url,
          duration: audio_status["duration"]
        }
        return
      end

      # Fallback: check cache
      cached = SectionAudioGenerator.cached(@step.id, section_index)
      if cached
        show_url = "/content/section_audio/#{@step.id}/#{section_index}/show"
        render json: { status: "ready", audio_url: show_url, duration: cached[:duration] }
      elsif audio_status && audio_status["status"] == "failed"
        render json: { status: "failed" }
      elsif audio_status && audio_status["status"] == "generating"
        render json: { status: "generating" }
      else
        render json: { status: "pending" }
      end
    end

    # GET /content/section_audio/:step_id/:section_index/show
    def show
      section_index = params[:section_index].to_i
      cached = SectionAudioGenerator.cached(@step.id, section_index)

      unless cached&.dig(:audio_url)
        head :not_found
        return
      end

      file_path = Rails.root.join(cached[:audio_url].delete_prefix("/")).expand_path
      audio_root = Rails.root.join("storage", "audio", "sections").expand_path.to_s

      if file_path.to_s.start_with?(audio_root) && File.exist?(file_path) && File.size(file_path) > 1024
        send_file file_path, type: "audio/mpeg", disposition: :inline
      else
        cache_key = SectionAudioGenerator.cache_key(@step.id, section_index)
        Rails.cache.delete(cache_key)
        File.delete(file_path) if file_path.to_s.start_with?(audio_root) && File.exist?(file_path)
        head :not_found
      end
    end

    private

    def set_step_and_authorize!
      @step = LearningRoutesEngine::RouteStep.find(params[:step_id])
      route = @step.learning_route
      unless route.learning_profile&.user_id == current_user.id
        head :forbidden
      end
    end

    def update_audio_section_status!(section_index, status, url = nil, duration = nil)
      metadata = @step.metadata || {}
      audio_sections = metadata["audio_sections"] || {}
      entry = { "status" => status }
      entry["url"] = url if url
      entry["duration"] = duration if duration
      audio_sections[section_index.to_s] = entry
      @step.update!(metadata: metadata.merge("audio_sections" => audio_sections))
    rescue => e
      Rails.logger.warn("[SectionAudioController] Status update failed: #{e.message}")
    end
  end
end
