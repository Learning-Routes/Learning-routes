module Assessments
  class VoiceResponsesController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    # POST /assessments/voice_responses
    # Receive recorded audio from user
    def create
      # Store the uploaded audio file
      audio_file = params[:audio_file]

      unless audio_file.present?
        render json: { error: "No audio file provided" }, status: :unprocessable_entity
        return
      end

      # Save audio to storage
      storage_dir = Rails.root.join("storage", "voice_responses")
      FileUtils.mkdir_p(storage_dir)

      blob_key = "vr_#{current_user.id}_#{@step.id}_#{Time.current.to_i}.webm"
      filepath = storage_dir.join(blob_key)
      File.binwrite(filepath, audio_file.read)

      # Create voice response record
      voice_response = VoiceResponse.create!(
        route_step: @step,
        user: current_user,
        audio_blob_key: blob_key,
        status: "transcribing"
      )

      # Enqueue evaluation job
      ContentEngine::VoiceEvaluationJob.perform_later(voice_response.id)

      respond_to do |format|
        format.json do
          render json: {
            status: "evaluating",
            voice_response_id: voice_response.id
          }
        end
        format.turbo_stream do
          render turbo_stream: turbo_stream.replace(
            "voice-interaction-#{@step.id}",
            partial: "assessments/voice_responses/evaluating",
            locals: { voice_response: voice_response, step: @step }
          )
        end
      end
    end

    # GET /assessments/voice_responses/:id
    # Show evaluation result
    def show
      @voice_response = VoiceResponse.find(params[:id])
      unless @voice_response.user_id == current_user.id
        head :forbidden
        return
      end

      respond_to do |format|
        format.json do
          render json: {
            status: @voice_response.status,
            score: @voice_response.score,
            evaluation: @voice_response.ai_evaluation,
            transcription: @voice_response.transcription
          }
        end
        format.html
      end
    end

    private

    def set_step_and_authorize!
      @step = LearningRoutesEngine::RouteStep.find(params[:route_step_id] || params[:step_id])
      route = @step.learning_route
      unless route.learning_profile.user_id == current_user.id
        head :forbidden
        return false
      end
      true
    end
  end
end
