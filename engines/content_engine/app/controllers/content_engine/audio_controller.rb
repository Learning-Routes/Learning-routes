module ContentEngine
  class AudioController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    def show
      content = @step.ai_contents.with_audio_ready.first

      if content&.audio_url
        file_path = Rails.root.join(content.audio_url.delete_prefix("/"))
        if File.exist?(file_path)
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

      render json: {
        status: content&.audio_status || "pending",
        audio_url: content&.audio_url
      }
    end

    private

    def set_step_and_authorize!
      @step = LearningRoutesEngine::RouteStep.find(params[:id])
      route = @step.learning_route
      unless route.learning_profile.user_id == current_user.id
        head :forbidden
      end
    end
  end
end
