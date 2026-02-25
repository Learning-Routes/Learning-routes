module Assessments
  class VoiceResponsesController < ApplicationController
    before_action :authenticate_user!

    MAX_AUDIO_SIZE = 10.megabytes
    ALLOWED_CONTENT_TYPES = %w[audio/webm audio/ogg audio/mp4 audio/mpeg].freeze

    def create
      step = LearningRoutesEngine::RouteStep.find(params[:route_step_id])

      # Authorization: verify user owns this step's route
      route = step.learning_route
      return head(:forbidden) unless route.learning_profile.user_id == current_user.id

      # Validate audio file
      audio = params[:audio]
      return head(:bad_request) unless audio.respond_to?(:read)
      return head(:request_entity_too_large) if audio.respond_to?(:size) && audio.size > MAX_AUDIO_SIZE

      dir = Rails.root.join("storage", "voice_responses")
      FileUtils.mkdir_p(dir)
      blob_key = "vr_#{step.id}_#{current_user.id}_#{Time.current.to_i}.webm"
      File.binwrite(dir.join(blob_key), audio.read)

      voice_response = Assessments::VoiceResponse.create!(
        route_step_id: step.id,
        user_id: current_user.id,
        audio_blob_key: blob_key,
        status: "pending"
      )

      ContentEngine::VoiceEvaluationJob.perform_later(voice_response.id)

      render json: { id: voice_response.id, status: "pending" }, status: :created
    end

    def show
      # Scope to current user's voice responses
      vr = Assessments::VoiceResponse.where(user_id: current_user.id).find(params[:id])
      render json: {
        id: vr.id,
        status: vr.status,
        score: vr.score,
        transcription: vr.transcription,
        ai_evaluation: vr.ai_evaluation
      }
    end
  end
end
