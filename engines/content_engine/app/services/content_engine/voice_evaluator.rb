require "open3"

module ContentEngine
  class VoiceEvaluator
    class TranscriptionError < StandardError; end

    STT_MODEL = "scribe_v2"
    def self.evaluate!(voice_response)
      new(voice_response).evaluate!
    end

    def initialize(voice_response)
      @response = voice_response
      @step = voice_response.route_step
    end

    def evaluate!
      @response.update!(status: "transcribing")
      transcription = transcribe_audio
      @response.update!(transcription: transcription, status: "evaluating")

      evaluation = evaluate_response(transcription)

      @response.update!(
        ai_evaluation: evaluation,
        score: evaluation["score"].to_i,
        status: "completed"
      )
      @response
    rescue => e
      @response.update!(status: "failed")
      raise e
    end

    private

    def transcribe_audio
      blob_key = @response.audio_blob_key.to_s
      raise "Invalid audio blob key" if blob_key.blank? || blob_key.include?("..") || blob_key.include?("/")

      audio_path = Rails.root.join("storage", "voice_responses", blob_key)
      raise "Audio file not found: #{blob_key}" unless File.exist?(audio_path)

      duration = audio_duration_seconds(audio_path)

      # THROUGH AiClient, not our own Net::HTTP. This posted straight to
      # api.elevenlabs.io, which put it outside SpendGuard's ceilings and outside
      # the per-model rate limit (WP-34 §3.2). The request itself is unchanged —
      # AiClient#stt sends the same multipart body to the same endpoint — but the
      # guard now runs before it, and a refusal costs nothing.
      result =
        begin
          AiOrchestrator::AiClient
            .new(model: STT_MODEL, task_type: :transcription, user: @response.user)
            .stt(file_path: audio_path, params: { model_id: STT_MODEL })
        rescue AiOrchestrator::AiClient::RequestError => e
          # Same shape as the old non-2xx branch: record the failed provider call
          # and surface it as this class's own error, so every caller sees what
          # it saw before.
          record_failed_transcription!
          failure_recorded = true
          # The status, never the provider's message: the old non-2xx branch said
          # only the HTTP code, and VoiceEvaluatorMeteringTest pins that this does
          # not disclose the response body.
          raise TranscriptionError, "Scribe request failed with HTTP #{e.status}"
        end

      provider_completed = true
      AiOrchestrator::SpeechCostRecorder.record_stt!(
        user: @response.user, duration_seconds: duration
      )
      parse_transcription(result[:content])
    rescue AiOrchestrator::SpendGuard::LimitExceeded
      # A refusal is not a failed transcription: the guard raises BEFORE the
      # request, so nothing was spent and there is no provider call to record.
      raise
    rescue => e
      record_failed_transcription! unless provider_completed || failure_recorded
      raise
    end

    def parse_transcription(body)
      transcription = JSON.parse(body)["text"]
      raise TranscriptionError, "Scribe response missing transcription text" if transcription.blank?

      transcription
    rescue JSON::ParserError
      raise TranscriptionError, "Malformed Scribe response"
    end

    def record_failed_transcription!
      AiOrchestrator::AiInteraction.create!(
        user: @response.user, model: STT_MODEL, task_type: "transcription",
        prompt: "provider_usage", status: :failed, pricing_status: "unpriced"
      )
    rescue ActiveRecord::ActiveRecordError
      nil
    end

    def audio_duration_seconds(audio_path)
      output, _error, status = Open3.capture3(
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", audio_path.to_s
      )
      return nil unless status.success?

      duration = BigDecimal(output.strip)
      duration.positive? ? duration : nil
    rescue ArgumentError, Errno::ENOENT
      nil
    end

    def evaluate_response(transcription)
      content = @step.ai_contents.order(created_at: :desc).first
      route = @step.learning_route
      profile = route.learning_profile

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :voice_evaluation,
        variables: {
          narration_script: content&.audio_transcript || content&.body || "",
          discussion_question: content&.metadata&.dig("discussion_questions")&.first || "",
          student_transcription: transcription,
          student_level: profile&.current_level || "beginner",
          locale: route.locale || "en"
        },
        user: profile&.user,
        async: false
      )

      unless interaction.completed?
        raise "Voice evaluation failed: #{interaction.error_message}"
      end

      parse_json_response(interaction.response)
    end

    def parse_json_response(response_text)
      json_match = response_text.to_s.match(/\{[\s\S]*\}/)
      return {} unless json_match

      JSON.parse(json_match[0])
    rescue JSON::ParserError
      { "score" => 0, "feedback" => response_text }
    end
  end
end
