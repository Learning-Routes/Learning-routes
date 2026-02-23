module ContentEngine
  class AudioGenerator
    AUDIO_STORAGE_DIR = Rails.root.join("storage", "audio")

    class GenerationError < StandardError; end

    def initialize(route_step)
      @step = route_step
      @route = route_step.learning_route
      @profile = @route.learning_profile
      @user = @profile.user
    end

    def generate!
      # Find or create the AI content record for this step
      ai_content = find_or_create_content!

      return ai_content if ai_content.audio_ready?

      ai_content.mark_audio_generating!

      begin
        # Step 1: Generate narration script via LLM prompt template
        narration = generate_narration_script

        # Step 2: Convert script to audio via ElevenLabs
        audio_result = synthesize_audio(narration[:script])

        # Step 3: Store the audio file
        audio_path = store_audio_file(audio_result[:content])

        # Step 4: Update the content record
        ai_content.mark_audio_ready!(
          url: audio_path,
          duration: narration[:estimated_duration],
          voice: audio_result[:voice_id],
          transcript: narration[:script]
        )

        # Also store narration metadata
        ai_content.update!(
          metadata: ai_content.metadata.merge(
            "narration" => {
              "title" => narration[:title],
              "summary" => narration[:summary],
              "key_points" => narration[:key_points],
              "discussion_questions" => narration[:discussion_questions]
            }
          )
        )

        ai_content
      rescue => e
        ai_content.mark_audio_failed!
        Rails.logger.error("[AudioGenerator] Failed for step #{@step.id}: #{e.message}")
        raise GenerationError, "Audio generation failed: #{e.message}"
      end
    end

    private

    def find_or_create_content!
      existing = AiContent.where(route_step: @step).by_type(:text).first

      if existing
        existing
      else
        AiContent.create!(
          route_step: @step,
          content_type: :text,
          body: @step.description || @step.title,
          ai_model: "elevenlabs",
          audio_status: "pending"
        )
      end
    end

    def generate_narration_script
      existing_content = AiContent.where(route_step: @step).by_type(:text).first

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :voice_narration,
        variables: {
          topic: @step.title,
          module_name: @step.title,
          route_topic: @route.topic,
          description: @step.description.to_s,
          level: @profile.current_level,
          estimated_minutes: @step.estimated_minutes.to_s,
          existing_content: existing_content&.body.to_s.truncate(4000)
        },
        user: @user,
        async: false
      )

      unless interaction.completed?
        raise GenerationError, "Narration script generation failed"
      end

      parsed = parse_json_response(interaction.response)

      {
        title: parsed["title"] || @step.title,
        script: parsed["narration_script"] || parsed["content"] || interaction.response,
        summary: parsed["summary"] || "",
        key_points: parsed["key_points"] || [],
        discussion_questions: parsed["discussion_questions"] || [],
        estimated_duration: parsed["estimated_duration_seconds"] || 300
      }
    end

    def synthesize_audio(text)
      voice_id = select_voice_for_locale

      client = AiOrchestrator::AiClient.new(
        model: "elevenlabs",
        task_type: :voice_narration,
        user: @user
      )

      result = client.chat(
        prompt: text,
        params: { voice_id: voice_id }
      )

      {
        content: result[:content],
        voice_id: voice_id,
        content_type: result[:content_type]
      }
    end

    def store_audio_file(audio_data)
      FileUtils.mkdir_p(AUDIO_STORAGE_DIR)

      filename = "step_#{@step.id}_#{Time.current.to_i}.mp3"
      filepath = AUDIO_STORAGE_DIR.join(filename)

      File.binwrite(filepath, audio_data)

      # Return a relative URL path for serving
      "/storage/audio/#{filename}"
    end

    def select_voice_for_locale
      locale = @route.locale || "en"

      # ElevenLabs voice IDs for different locales
      voices = {
        "en" => Rails.application.credentials.dig(:elevenlabs, :default_voice_id) || "21m00Tcm4TlvDq8ikWAM",
        "es" => Rails.application.credentials.dig(:elevenlabs, :spanish_voice_id) || "21m00Tcm4TlvDq8ikWAM"
      }

      voices[locale] || voices["en"]
    end

    def parse_json_response(response_text)
      # Try to extract JSON from the response
      json_match = response_text.match(/\{[\s\S]*\}/)
      return {} unless json_match

      JSON.parse(json_match[0])
    rescue JSON::ParserError
      { "narration_script" => response_text }
    end
  end
end
