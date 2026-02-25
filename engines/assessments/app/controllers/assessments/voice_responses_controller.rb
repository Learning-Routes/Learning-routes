module Assessments
  class VoiceResponsesController < ApplicationController
    before_action :authenticate_user!

    def create
      step = LearningRoutesEngine::RouteStep.find(params[:route_step_id])

      dir = Rails.root.join("storage", "voice_responses")
      FileUtils.mkdir_p(dir)
      blob_key = "vr_#{step.id}_#{current_user.id}_#{Time.current.to_i}.webm"
      File.binwrite(dir.join(blob_key), params[:audio].read)

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
      vr = Assessments::VoiceResponse.find(params[:id])
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
