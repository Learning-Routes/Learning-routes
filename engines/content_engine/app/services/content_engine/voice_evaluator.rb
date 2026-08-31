require "open3"

module ContentEngine
  class VoiceEvaluator
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

      api_key = Rails.application.credentials.dig(:elevenlabs, :api_key)

      uri = URI("https://api.elevenlabs.io/v1/speech-to-text")

      request = Net::HTTP::Post.new(uri)
      request["xi-api-key"] = api_key

      duration = audio_duration_seconds(audio_path)
      interaction = AiOrchestrator::AiInteraction.create!(
        user: @response.user, model: STT_MODEL, task_type: "transcription",
        prompt: "provider_usage", status: :processing, pricing_status: "unpriced"
      )

      form_data = [
        ["file", File.open(audio_path, "rb")],
        ["model_id", STT_MODEL]
      ]
      request.set_form(form_data, "multipart/form-data")

      http = Net::HTTP.new(uri.hostname, uri.port)
      http.use_ssl = true
      http.open_timeout = 10
      http.read_timeout = 60
      response = http.request(request)

      unless response.is_a?(Net::HTTPSuccess)
        raise "ElevenLabs STT error: #{response.code} - #{response.body}"
      end

      transcription = JSON.parse(response.body)["text"]
      metered = AiOrchestrator::SpeechCostRecorder.record_stt!(
        user: @response.user, duration_seconds: duration
      )
      if metered
        interaction.destroy!
      else
        interaction.update!(status: :completed, provider_units: duration && (duration * 1_000).round)
      end
      transcription
    rescue => e
      begin
        interaction&.update!(status: :failed, pricing_status: "unpriced")
      rescue ActiveRecord::ActiveRecordError
        nil
      end
      raise
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
