module Assessments
  class VoiceResponsesController < ApplicationController
    before_action :authenticate_user!
    rate_limit to: 10, within: 5.minutes, only: :create, with: -> {
      head :too_many_requests
    }

    MAX_AUDIO_SIZE = 10.megabytes
    ALLOWED_CONTENT_TYPES = %w[audio/webm audio/ogg audio/mp4 audio/mpeg].freeze

    def create
      # Transcribing and evaluating this recording is billable AI work, so it
      # asks the generation gate, not the read gate: a refunded route keeps its
      # existing content but stops commissioning more.
      unless LearningRoutesEngine::ModuleAccessPolicy.generation_allowed?(
        user: current_user, step_id: params[:route_step_id]
      )
        return head :forbidden
      end

      step = LearningRoutesEngine::RouteStep.find(params[:route_step_id])

      # Validate audio file
      audio = params[:audio]
      return head(:bad_request) unless audio.respond_to?(:read)
      return head(:request_entity_too_large) if audio.respond_to?(:size) && audio.size > MAX_AUDIO_SIZE
      # Compare the MEDIA TYPE, not the whole Content-Type header.
      #
      # `MediaRecorder` reports its mimeType WITH parameters, and the recorder's
      # first candidate is "audio/webm;codecs=opus" — which Chrome supports, so
      # every recording made in Chrome was uploaded as that string and compared
      # with `include?` against a list containing only "audio/webm". Exact string
      # equality against a list written without codec parameters: this refused
      # every Chrome recording the feature has ever taken.
      #
      # Parsing the parameters off is the fix. Adding "audio/webm;codecs=opus" to
      # the list would fix one browser and leave Firefox
      # ("audio/ogg;codecs=opus") and the next codec string to fail identically.
      if audio.respond_to?(:content_type) && !ALLOWED_CONTENT_TYPES.include?(media_type_of(audio))
        return head(:unsupported_media_type)
      end

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

    private

    # "audio/webm;codecs=opus" -> "audio/webm"
    def media_type_of(audio)
      audio.content_type.to_s.split(";").first.to_s.strip.downcase
    end
  end
end
