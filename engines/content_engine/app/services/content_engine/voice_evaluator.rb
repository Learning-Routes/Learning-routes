module ContentEngine
  class VoiceEvaluator
    class EvaluationError < StandardError; end

    def initialize(voice_response)
      @response = voice_response
      @step = voice_response.route_step
      @route = @step.learning_route
      @profile = @route.learning_profile
      @user = voice_response.user
    end

    def evaluate!
      @response.update!(status: "evaluating")

      begin
        # Step 1: Transcribe audio if not already transcribed
        transcription = @response.transcription
        if transcription.blank?
          transcription = transcribe_audio
          @response.update!(transcription: transcription, status: "evaluating")
        end

        # Step 2: Get lesson context for evaluation
        ai_content = ContentEngine::AiContent.where(route_step: @step).by_type(:text).first
        narration_data = ai_content&.metadata&.dig("narration") || {}

        # Step 3: Evaluate via LLM prompt template
        interaction = AiOrchestrator::Orchestrate.call(
          task_type: :voice_evaluation,
          variables: {
            topic: @step.title,
            module_name: @step.title,
            key_points: (narration_data["key_points"] || []).join(", "),
            discussion_question: (narration_data["discussion_questions"] || []).first.to_s,
            transcription: transcription
          },
          user: @user,
          async: false
        )

        unless interaction.completed?
          raise EvaluationError, "Voice evaluation failed"
        end

        # Step 4: Parse and save evaluation
        evaluation = parse_json_response(interaction.response)

        @response.update!(
          status: "completed",
          score: evaluation["score"] || 0,
          ai_evaluation: evaluation
        )

        @response
      rescue => e
        @response.update!(status: "failed")
        Rails.logger.error("[VoiceEvaluator] Failed for response #{@response.id}: #{e.message}")
        raise EvaluationError, "Voice evaluation failed: #{e.message}"
      end
    end

    private

    def transcribe_audio
      # For now, use ElevenLabs speech-to-text or a simple fallback
      # This can be extended to use Whisper or ElevenLabs STT
      if @response.audio_blob_key.present?
        transcribe_via_api(@response.audio_blob_key)
      else
        ""
      end
    end

    def transcribe_via_api(audio_key)
      # Using ElevenLabs speech-to-text endpoint
      api_key = Rails.application.credentials.dig(:elevenlabs, :api_key) || ENV["ELEVENLABS_API_KEY"]
      audio_path = Rails.root.join("storage", "voice_responses", audio_key)

      return "" unless File.exist?(audio_path)

      response = HTTParty.post(
        "https://api.elevenlabs.io/v1/speech-to-text",
        headers: {
          "xi-api-key" => api_key
        },
        multipart: true,
        body: {
          file: File.open(audio_path, "rb"),
          model_id: "scribe_v1"
        },
        timeout: 60
      )

      if response.success?
        parsed = JSON.parse(response.body)
        parsed["text"] || ""
      else
        Rails.logger.error("[VoiceEvaluator] Transcription failed: #{response.code}")
        ""
      end
    rescue => e
      Rails.logger.error("[VoiceEvaluator] Transcription error: #{e.message}")
      ""
    end

    def parse_json_response(response_text)
      json_match = response_text.match(/\{[\s\S]*\}/)
      return {} unless json_match

      JSON.parse(json_match[0])
    rescue JSON::ParserError
      { "feedback" => response_text, "score" => 0 }
    end
  end
end
