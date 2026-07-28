module ContentEngine
  class AudioController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    def show
      content = @step.ai_contents.with_audio_ready.first

      if content&.audio_url
        file_path = AudioStorage.resolve(content.audio_url, scope: :audio)

        if file_path
          send_file file_path, type: "audio/mpeg", disposition: :inline
        else
          head :not_found
        end
      else
        head :not_found
      end
    end

    def generate
      ContentEngine::AudioGenerationJob.perform_later(@step.id)
      head :accepted
    end

    def status
      content = @step.ai_contents.order(created_at: :desc).first

      # If a worker died mid-generation, the record is stranded in "generating".
      # Recover it on poll so the client sees "failed" and can offer a retry
      # instead of spinning forever.
      content&.reset_if_stale_audio!

      render json: {
        status: content&.audio_status || "pending",
        audio_url: content&.audio_url
      }
    end

    private

    def set_step_and_authorize!
      @step = LearningRoutesEngine::RouteStep.find(params[:id])
      route = @step.learning_route
      unless route.learning_profile&.user_id == current_user.id
        head :forbidden
        return
      end
    end
  end
end
