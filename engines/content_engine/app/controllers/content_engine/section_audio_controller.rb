# frozen_string_literal: true

module ContentEngine
  class SectionAudioController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    # POST /content_engine/section_audio/:step_id/:section_index/generate
    def generate
      section_index = params[:section_index].to_i
      section_text = params[:section_text].to_s.strip

      if section_text.blank?
        render json: { status: "error", message: "No text provided" }, status: :unprocessable_entity
        return
      end

      locale = @step.learning_route&.locale || "en"

      SectionAudioGenerationJob.perform_later(
        @step.id, section_index, section_text, locale
      )

      render json: { status: "generating" }
    end

    # GET /content_engine/section_audio/:step_id/:section_index/status
    def status
      section_index = params[:section_index].to_i
      cached = SectionAudioGenerator.cached(@step.id, section_index)

      if cached
        render json: {
          status: "ready",
          audio_url: cached[:audio_url],
          duration: cached[:duration]
        }
      else
        render json: { status: "pending" }
      end
    end

    # GET /content_engine/section_audio/:step_id/:section_index/show
    def show
      section_index = params[:section_index].to_i
      cached = SectionAudioGenerator.cached(@step.id, section_index)

      unless cached&.dig(:audio_url)
        head :not_found
        return
      end

      file_path = Rails.root.join(cached[:audio_url].delete_prefix("/")).expand_path
      audio_root = Rails.root.join("storage", "audio", "sections").expand_path.to_s

      if file_path.to_s.start_with?(audio_root) && File.exist?(file_path)
        send_file file_path, type: "audio/mpeg", disposition: :inline
      else
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
  end
end
