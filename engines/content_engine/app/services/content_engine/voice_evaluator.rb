module ContentEngine
  class VoiceEvaluator
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
      audio_path = Rails.root.join("storage", "voice_responses", @response.audio_blob_key)
      api_key = Rails.application.credentials.dig(:elevenlabs, :api_key) || ENV["ELEVENLABS_API_KEY"]

      uri = URI("https://api.elevenlabs.io/v1/speech-to-text")

      request = Net::HTTP::Post.new(uri)
      request["xi-api-key"] = api_key

      form_data = [
        ["file", File.open(audio_path, "rb")],
        ["model_id", "scribe_v1"]
      ]
      request.set_form(form_data, "multipart/form-data")

      http = Net::HTTP.new(uri.hostname, uri.port)
      http.use_ssl = true
      http.read_timeout = 60
      response = http.request(request)

      unless response.is_a?(Net::HTTPSuccess)
        raise "ElevenLabs STT error: #{response.code} - #{response.body}"
      end

      JSON.parse(response.body)["text"]
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
