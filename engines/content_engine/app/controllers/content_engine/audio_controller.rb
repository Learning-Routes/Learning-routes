module ContentEngine
  class AudioController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    # GET /content/audio/:id
    # Serve or redirect to the audio file for a step
    def show
      ai_content = AiContent.where(route_step: @step).with_audio_ready.first

      if ai_content&.audio_ready?
        audio_path = Rails.root.join("public", ai_content.audio_url.delete_prefix("/"))

        if File.exist?(audio_path)
          send_file audio_path,
                    type: "audio/mpeg",
                    disposition: "inline",
                    filename: "lesson_#{@step.id}.mp3"
        else
          head :not_found
        end
      else
        head :not_found
      end
    end

    # POST /content/audio/:id/generate
    # Trigger on-demand audio generation
    def generate
      ai_content = AiContent.where(route_step: @step).by_type(:text).first

      if ai_content&.audio_ready?
        render json: { status: "ready", audio_url: audio_content_url(@step) }
        return
      end

      if ai_content&.audio_generating?
        render json: { status: "generating" }
        return
      end

      # Mark as generating and enqueue job
      ai_content&.mark_audio_generating! if ai_content

      ContentEngine::AudioGenerationJob.perform_later(@step.id)

      render json: { status: "generating" }
    end

    # GET /content/audio/:id/status
    # Check audio generation status (polling endpoint)
    def status
      ai_content = AiContent.where(route_step: @step).by_type(:text).first

      if ai_content.nil?
        render json: { status: "pending" }
      elsif ai_content.audio_ready?
        render json: {
          status: "ready",
          audio_url: audio_content_url(@step),
          duration: ai_content.audio_duration,
          transcript: ai_content.audio_transcript
        }
      elsif ai_content.audio_failed?
        render json: { status: "failed" }
      else
        render json: { status: ai_content.audio_status }
      end
    end

    private

    def set_step_and_authorize!
      @step = LearningRoutesEngine::RouteStep.find(params[:id])
      route = @step.learning_route
      unless route.learning_profile.user_id == current_user.id
        head :forbidden
        return false
      end
      true
    end

    def audio_content_url(step)
      content_engine.audio_path(step)
    end
  end
end
