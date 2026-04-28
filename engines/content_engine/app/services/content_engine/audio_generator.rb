module ContentEngine
  class AudioGenerator
    def self.generate!(route_step)
      new(route_step).generate!
    end

    def initialize(route_step)
      @step = route_step
      @route = route_step.learning_route
      @profile = @route.learning_profile
      @user = @profile&.user
    end

    def generate!
      content = find_or_create_content!
      return content if content.audio_ready?

      # Job-level retry_on RequestError + service-level voice fallback can stack
      # in pathological cases. If a previous attempt already wrote an audio file
      # and stored the URL, short-circuit before paying ElevenLabs again.
      return content if content.audio_url.present? && audio_file_exists?(content.audio_url)

      content.mark_audio_generating!

      narration = generate_narration_script
      audio_path = synthesize_audio_with_fallback(narration["narration_script"])

      # Persist transcript + metadata BEFORE flipping status to ready. Otherwise
      # a transient error after mark_audio_ready! would flip status to failed
      # while the audio file is already on disk — next retry re-pays for audio
      # we already have.
      content.update!(
        audio_transcript: narration["narration_script"],
        metadata: (content.metadata || {}).merge(
          "narration" => {
            "title" => narration["title"],
            "summary" => narration["summary"],
            "key_points" => narration["key_points"],
            "discussion_questions" => narration["discussion_questions"]
          }
        )
      )
      content.mark_audio_ready!(audio_path, narration["estimated_duration_seconds"])

      content
    rescue => e
      # Persist the reason so operators can diagnose failures without digging through logs.
      content&.mark_audio_failed!(e.message)
      raise e
    end

    private

    def find_or_create_content!
      # Scope to the text content type — a step can have multiple AiContent rows
      # (text + exercise variants) and `.first` was returning whichever the DB
      # ordered first, which isn't deterministic.
      @step.ai_contents.by_type(:text).first || ContentEngine::AiContent.create!(
        route_step_id: @step.id,
        content_type: "text",
        body: @step.description.presence || @step.title,
        audio_status: "pending"
      )
    end

    def audio_file_exists?(audio_url)
      # audio_url is a public-relative path like "/storage/audio/foo.mp3" — map
      # it back to disk to confirm it actually exists before short-circuiting.
      return false if audio_url.blank?
      Rails.root.join(audio_url.to_s.delete_prefix("/")).file?
    end

    def generate_narration_script
      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :voice_narration,
        variables: {
          route_topic: @route.topic,
          step_title: @step.title,
          step_description: @step.description.to_s,
          student_level: @profile&.current_level || "beginner",
          content_type: @step.content_type,
          locale: @route.locale || "en",
          estimated_minutes: @step.estimated_minutes || 5
        },
        user: @user,
        async: false
      )

      unless interaction.completed?
        raise "Narration script generation failed: #{interaction.error_message}"
      end

      parse_json_response(interaction.response)
    end

    # Try the locale-matched voice first; if ElevenLabs rejects it (misconfigured,
    # deprecated, or temporarily unavailable), retry once with the default voice
    # before giving up. ActiveJob's retry_on handles transient network issues at
    # a different layer — this is specifically for voice-specific failures.
    def synthesize_audio_with_fallback(script_text)
      primary_voice = select_voice
      synthesize_audio(script_text, primary_voice)
    rescue AiOrchestrator::AiClient::RequestError => e
      default = VoiceCatalog.default_voice
      if VoiceCatalog.fallback_needed?(primary_voice)
        Rails.logger.warn("[AudioGenerator] Primary voice #{primary_voice} failed (#{e.message.truncate(120)}) — retrying with default voice #{default}")
        synthesize_audio(script_text, default)
      else
        raise
      end
    end

    def synthesize_audio(script_text, voice_id)
      # Always use multilingual model — it handles single-language fine too,
      # and is required for bilingual language-learning routes.
      model_id = "eleven_multilingual_v2"

      client = AiOrchestrator::AiClient.new(
        model: "elevenlabs",
        task_type: :voice_narration,
        user: @user
      )

      result = client.chat(
        prompt: script_text,
        params: { voice_id: voice_id, model_id: model_id }
      )

      store_audio_file(result[:content])
    end

    def select_voice
      # Bilingual routes narrate in the target language (Portuguese class → Portuguese voice)
      lang = if bilingual_route?
               @route.target_locale
             else
               @route.locale || "en"
             end
      VoiceCatalog.voice_for(lang)
    end

    def bilingual_route?
      @route.respond_to?(:language_route?) && @route.language_route?
    end

    def store_audio_file(audio_data)
      dir = Rails.root.join("storage", "audio")
      FileUtils.mkdir_p(dir)

      filename = "step_#{@step.id}_#{Time.current.to_i}.mp3"
      path = dir.join(filename)
      File.binwrite(path, audio_data)

      "/storage/audio/#{filename}"
    end

    def parse_json_response(response_text)
      json_match = response_text.to_s.match(/\{[\s\S]*\}/)
      return {} unless json_match

      JSON.parse(json_match[0])
    rescue JSON::ParserError
      { "narration_script" => response_text }
    end
  end
end
